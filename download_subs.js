const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const path = require('path');
const domestikaAuth = require('./auth.js');
const inquirer = require('inquirer');

async function main() {
    try {
        console.log('Iniciando Domestika Subtitles Downloader...');
        
        // Obtener credenciales
        const auth = await domestikaAuth.getCookies();
        
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'courseUrls',
                message: 'URLs de los cursos (separadas por espacios):',
                validate: (input) => {
                    const urls = input.trim().split(' ');
                    const validUrls = urls.every(url => {
                        return url.match(/domestika\.org\/.*?\/courses\/\d+[-\w]+/);
                    });
                    if (validUrls) {
                        return true;
                    }
                    return 'Por favor ingresa URLs válidas de cursos de Domestika';
                }
            },
            {
                type: 'list',
                name: 'subtitles',
                message: '¿En qué idioma quieres los subtítulos?',
                choices: [
                    { name: 'Español', value: 'es' },
                    { name: 'Inglés', value: 'en' },
                    { name: 'Portugués', value: 'pt' },
                    { name: 'Francés', value: 'fr' },
                    { name: 'Alemán', value: 'de' },
                    { name: 'Italiano', value: 'it' }
                ]
            }
        ]);

        // Normalizar y procesar cada URL
        const courseUrls = answers.courseUrls
            .trim()
            .split(' ')
            .map(url => normalizeDomestikaUrl(url));

        for (const urlInfo of courseUrls) {
            console.log(`\n📚 Procesando subtítulos del curso: ${urlInfo.courseTitle}`);
            await scrapeSite(urlInfo.url, answers.subtitles, auth, urlInfo.courseTitle);
        }
        
        console.log('\n✅ Todos los subtítulos han sido procesados');
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

function normalizeDomestikaUrl(url) {
    const courseRegex = /domestika\.org\/.*?\/courses\/(\d+)-([-\w]+)/;
    const match = url.match(courseRegex);
    
    if (match) {
        const rawTitle = match[2]
            .replace(/-/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        
        return {
            url: `https://www.domestika.org/es/courses/${match[1]}/course`,
            courseTitle: rawTitle
        };
    }
    
    return { url: url, courseTitle: null };
}

async function scrapeSite(courseUrl, subtitle_lang, auth, courseTitle) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setCookie(...auth.cookies);

    await page.goto(courseUrl);
    const html = await page.content();
    const $ = cheerio.load(html);

    let units = $('h4.h2.unit-item__title a');
    
    for (let i = 0; i < units.length; i++) {
        const videoData = await getInitialProps($(units[i]).attr('href'), page);
        const unitTitle = $(units[i]).text().trim().replace(/[/\\?%*:|"<>]/g, '-');
        
        for (let j = 0; j < videoData.length; j++) {
            await downloadSubtitles(
                videoData[j],
                courseTitle,
                unitTitle,
                j + 1,
                subtitle_lang,
                i + 1
            );
        }
    }

    await browser.close();
}

async function getInitialProps(url, page) {
    await page.goto(url);
    const data = await page.evaluate(() => window.__INITIAL_PROPS__);
    const html = await page.content();
    const $ = cheerio.load(html);

    let section = $('h2.h3.course-header-new__subtitle').text().trim().replace(/[/\\?%*:|"<>]/g, '-');
    let videoData = [];

    if (data?.videos?.length > 0) {
        videoData = data.videos.map(el => ({
            playbackURL: el.video.playbackURL,
            title: el.video.title.trim(),
            section: section,
        }));
    }

    return videoData;
}

async function downloadSubtitles(vData, courseTitle, unitTitle, index, subtitle_lang, unitNumber) {
    if (!vData.playbackURL) {
        throw new Error(`URL no válida para ${vData.title}`);
    }

    const finalDir = path.join('domestika_courses', courseTitle, vData.section, unitTitle).replace(/\/+/g, '/');
    
    try {
        if (!fs.existsSync(finalDir)) {
            fs.mkdirSync(finalDir, { recursive: true });
        }
        
        const fileName = `${courseTitle} - U${unitNumber} - ${index}_${vData.title.trimEnd()}`;
        
        console.log(`\nDescargando subtítulos para: ${fileName}`);
        
        await exec(
            `./N_m3u8DL-RE --sub-only --auto-subtitle-fix --sub-format SRT --select-subtitle lang="${subtitle_lang}":for=all "${vData.playbackURL}" --save-dir "${finalDir}" --save-name "${fileName}" --tmp-dir ".tmp" --log-level OFF`,
            { maxBuffer: 1024 * 1024 * 100 }
        );

        console.log('✓ Subtítulos descargados');
        return true;
    } catch (error) {
        console.error(`Error descargando subtítulos: ${error.message}`);
        return false;
    }
}

main().catch(console.error); 