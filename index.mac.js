const fs = require('fs');
const util = require('util');
const { execFile } = require('child_process');
const execFileAsync = util.promisify(execFile);
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const path = require('path');
const domestikaAuth = require('./auth.js');

// Variables para los módulos que necesitan instalación
let inquirer;

// --- CONFIGURATION ---
const debug = false;
const debug_data = [];

// Estas variables se obtendrán del usuario
let course_url;
let subtitle_lang;
let quality;
let downloadOption;

// --- END CONFIGURATION ---

function sanitizePathSegment(value) {
    return value
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

async function runBinary(command, args, options = {}) {
    return execFileAsync(command, args, {
        maxBuffer: 1024 * 1024 * 100,
        ...options
    });
}

// Función para verificar e instalar dependencias
async function checkAndInstallDependencies() {
    const requiredModules = {
        'inquirer': () => inquirer = require('inquirer'),
        'cheerio': () => require('cheerio'),
        'puppeteer': () => require('puppeteer'),
        'dotenv': () => require('dotenv')
    };

    const missingModules = [];

    for (const [moduleName, requireFn] of Object.entries(requiredModules)) {
        try {
            requireFn();
            console.log(`✓ ${moduleName} está instalado`);
        } catch (error) {
            console.log(`✗ ${moduleName} no está instalado`);
            missingModules.push(moduleName);
        }
    }

    if (missingModules.length > 0) {
        console.log(`\nInstalando dependencias faltantes: ${missingModules.join(', ')}...`);
        try {
            await runBinary('npm', ['install', ...missingModules]);
            console.log('Dependencias instaladas correctamente.');
            
            // Reiniciar el programa después de instalar las dependencias
            console.log('Reiniciando el programa...\n');
            process.exit(0); // Salir con código 0 para indicar que no es un error
        } catch (error) {
            throw new Error(`Error instalando dependencias: ${error.message}`);
        }
    }
}

// Función para normalizar URLs de Domestika
function normalizeDomestikaUrl(url) {
    const courseRegex = /domestika\.org\/.*?\/courses\/(\d+)-([-\w]+)/;
    const match = url.match(courseRegex);
    
    if (match) {
        // Extraer y limpiar el título del curso
        const rawTitle = match[2]
            .replace(/-/g, ' ')  // Reemplazar guiones por espacios
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalizar cada palabra
            .join(' ');
        
        return {
            url: `https://www.domestika.org/es/courses/${match[1]}/course`,
            courseTitle: rawTitle
        };
    }
    
    return { url: url, courseTitle: null };
}

// Función principal
async function main() {
    try {
        console.log('Iniciando Domestika Downloader...');
        
        // Verificar e instalar dependencias
        await checkAndInstallDependencies();
        
        // Obtener credenciales
        const auth = await domestikaAuth.getCookies();
        
        // Pedir opciones al usuario
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'courseUrls',
                message: 'URLs de los cursos (separadas por espacios):',
                validate: (input) => {
                    const urls = input.trim().split(' ');
                    const validUrls = urls.every(url => {
                        // Verificar que sea una URL de curso de Domestika
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
                message: '¿Deseas descargar subtítulos?',
                choices: [
                    { name: 'No descargar subtítulos', value: null },
                    { name: 'Español', value: 'es' },
                    { name: 'Inglés', value: 'en' },
                    { name: 'Portugués', value: 'pt' },
                    { name: 'Francés', value: 'fr' },
                    { name: 'Alemán', value: 'de' },
                    { name: 'Italiano', value: 'it' }
                ]
            },
            {
                type: 'list',
                name: 'downloadOption',
                message: '¿Qué deseas descargar?',
                choices: [
                    { name: 'Todo el curso', value: 'all' },
                    { name: 'Videos específicos', value: 'specific' }
                ]
            }
        ]);

        // Verificar N_m3u8DL-RE
        const N_M3U8DL_RE = process.platform === 'win32' ? 'N_m3u8DL-RE.exe' : 'N_m3u8DL-RE';
        if (!fs.existsSync(N_M3U8DL_RE)) {
            throw new Error(`${N_M3U8DL_RE} not found! Download the Binary here: https://github.com/nilaoda/N_m3u8DL-RE/releases`);
        }

        // Normalizar y procesar cada URL
        const courseUrls = answers.courseUrls
            .trim()
            .split(' ')
            .map(url => normalizeDomestikaUrl(url));

        console.log(`\nSe procesarán ${courseUrls.length} cursos:`);
        courseUrls.forEach((urlInfo, index) => {
            console.log(`${index + 1}. ${urlInfo.url} (${urlInfo.courseTitle})`);
        });

        for (let i = 0; i < courseUrls.length; i++) {
            const urlInfo = courseUrls[i];
            console.log(`\n📚 Procesando curso ${i + 1} de ${courseUrls.length}: ${urlInfo.courseTitle}`);
            await scrapeSite(urlInfo.url, answers.subtitles, auth, answers.downloadOption, urlInfo.courseTitle);
        }
        
        console.log('\n✅ Todos los cursos han sido procesados');
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Iniciar la aplicación
if (require.main === module) {
    main().catch(error => {
        console.error('Error fatal:', error);
        process.exit(1);
    });
}

// Exportar main para uso externo
module.exports = { main };

// ... resto de las funciones (scrapeSite, downloadVideo, etc.) ...

async function scrapeSite(courseUrl, subtitle_lang, auth, downloadOption, courseTitle) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(0);
    await page.setCookie(...auth.cookies);

    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image') {
            req.abort();
        } else {
            req.continue();
        }
    });

    await page.goto(courseUrl);
    const html = await page.content();
    const $ = cheerio.load(html);

    console.log('Analizando sitio');

    let allVideos = [];
    let units = $('h4.h2.unit-item__title a');

    // Verificar si estamos en la página correcta
    if (units.length === 0) {
        await page.close();
        await browser.close();

        console.log('\n❌ No se encontraron videos. Esto puede deberse a cookies inválidas.');
        
        const answer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'updateCookies',
                message: '¿Deseas actualizar las cookies?',
                default: true
            }
        ]);

        if (answer.updateCookies) {
            // Forzar la actualización de credenciales
            await domestikaAuth.promptForCredentials(true);
            // Intentar nuevamente con las nuevas credenciales
            return scrapeSite(courseUrl, subtitle_lang, await domestikaAuth.getCookies(), downloadOption, courseTitle);
        } else {
            throw new Error('No se pueden descargar los videos sin cookies válidas.');
        }
    }

    console.log(`Curso: ${courseTitle}`);
    console.log(`${units.length} Unidades detectadas`);

    for (let i = 0; i < units.length; i++) {
        let videoData = await getInitialProps($(units[i]).attr('href'), page);
        allVideos.push({
            title: $(units[i])
                .text()
                .replaceAll('.', '')
                .trim()
                .replace(/[/\\?%*:|"<>]/g, '-'),
            videoData: videoData,
            unitNumber: i + 1
        });
    }

    // Si el usuario eligió descargar videos específicos
    if (downloadOption === 'specific') {
        const videoChoices = allVideos.flatMap(unit => {
            // Crear el separador/header para la unidad
            const unitHeader = {
                name: `Unidad ${unit.unitNumber}: ${unit.title}`,
                value: `unit_${unit.unitNumber}`,
                checked: false,
                type: 'unit'
            };

            // Crear las opciones para cada video con indentación
            const unitVideos = unit.videoData.map((vData, index) => ({
                name: `    ${index + 1}. ${vData.title}`,
                value: {
                    unit: unit,
                    videoData: vData,
                    index: index + 1
                },
                short: vData.title
            }));

            return [unitHeader, ...unitVideos];
        });

        const selectedVideos = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'videosToDownload',
                message: 'Selecciona unidades completas o videos específicos:',
                choices: videoChoices,
                pageSize: 20,
                loop: false
            }
        ]);

        // Procesar las selecciones
        for (const selection of selectedVideos.videosToDownload) {
            if (typeof selection === 'string' && selection.startsWith('unit_')) {
                // Si se seleccionó una unidad completa
                const unitNumber = parseInt(selection.split('_')[1]);
                const unit = allVideos.find(u => u.unitNumber === unitNumber);
                
                if (unit) {
                    for (let i = 0; i < unit.videoData.length; i++) {
                        await downloadVideo(
                            unit.videoData[i],
                            courseTitle,
                            unit.title,
                            i + 1,
                            subtitle_lang,
                            unit.unitNumber
                        );
                    }
                }
            } else {
                // Si se seleccionó un video específico
                await downloadVideo(
                    selection.videoData,
                    courseTitle,
                    selection.unit.title,
                    selection.index,
                    subtitle_lang,
                    selection.unit.unitNumber
                );
            }
        }

        await page.close();
        await browser.close();
        return;
    }

    // Si llegamos aquí es porque downloadOption === 'all'
    console.log('Descargando todo el curso...');
    let completedVideos = 0;
    const totalVideos = allVideos.reduce((acc, unit) => acc + unit.videoData.length, 0);

    // Usar solo el método paralelo para descargar todo el curso
    let downloadPromises = [];

    for (let i = 0; i < allVideos.length; i++) {
        const unit = allVideos[i];
        for (let a = 0; a < unit.videoData.length; a++) {
            const vData = unit.videoData[a];
            if (!vData || !vData.playbackURL) {
                console.error(`Error: Datos de video inválidos para ${unit.title} #${a}`);
                continue;
            }

            downloadPromises.push(
                (async () => {
                    try {
                        console.log(`\nIniciando descarga: ${vData.title}`);
                        await downloadVideo(vData, courseTitle, unit.title, a + 1, subtitle_lang, unit.unitNumber);
                        completedVideos++;
                        console.log(`\nCompletados ${completedVideos} de ${totalVideos} videos`);
                        return true;
                    } catch (error) {
                        console.error(`Error en video ${vData.title}:`, error);
                        return false;
                    }
                })()
            );
        }
    }

    await Promise.all(downloadPromises);

    if (completedVideos === 0) {
        console.log('\n❌ No se pudo descargar ningún video. Esto puede deberse a cookies inválidas.');
        
        const answer = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'updateCookies',
                message: '¿Deseas actualizar las cookies?',
                default: true
            }
        ]);

        if (answer.updateCookies) {
            // Forzar la actualización de credenciales
            await domestikaAuth.promptForCredentials(true);
            // Intentar nuevamente con las nuevas credenciales
            return scrapeSite(courseUrl, subtitle_lang, await domestikaAuth.getCookies(), downloadOption, courseTitle);
        }
    } else {
        console.log(`\nProceso finalizado. Completados ${completedVideos} de ${totalVideos} videos`);
    }

    await page.close();
    await browser.close();
}

async function getInitialProps(url, page) {
    await page.goto(url);
    const data = await page.evaluate(() => window.__INITIAL_PROPS__);
    const html = await page.content();
    const $ = cheerio.load(html);

    let section = $('h2.h3.course-header-new__subtitle')
        .text()
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-');

    let videoData = [];

    if (data && data.videos && data.videos.length > 0) {
        for (let i = 0; i < data.videos.length; i++) {
            const el = data.videos[i];
            videoData.push({
                playbackURL: el.video.playbackURL,
                title: el.video.title.replaceAll('.', '').trim(),
                section: section,
            });
            console.log('Video encontrado: ' + el.video.title);
        }
    }

    return videoData;
}

async function downloadVideo(vData, courseTitle, unitTitle, index, subtitle_lang, unitNumber) {
    if (!vData.playbackURL) {
        throw new Error(`URL de video no válida para ${vData.title}`);
    }

    const sanitizedCourseTitle = sanitizePathSegment(courseTitle);
    const sanitizedSection = sanitizePathSegment(vData.section);
    const sanitizedUnitTitle = sanitizePathSegment(unitTitle);
    const sanitizedVideoTitle = sanitizePathSegment(vData.title.trimEnd());
    const finalDir = path.join('domestika_courses', sanitizedCourseTitle, sanitizedSection, sanitizedUnitTitle);
    
    try {
        if (!fs.existsSync(finalDir)) {
            fs.mkdirSync(finalDir, { recursive: true });
        }
        
        const fileName = `${sanitizedCourseTitle} - U${unitNumber} - ${index}_${sanitizedVideoTitle}`;
        
        console.log('\nInformación de descarga:');
        console.log('URL:', vData.playbackURL);
        console.log('Directorio final:', finalDir);
        console.log('Nombre archivo:', fileName);
        
        console.log('\nDescargando video...');
        
        let downloadSuccess = false;
        
        try {
            // Intentar primero con 1080p
            await runBinary('./N_m3u8DL-RE', [
                '-sv', 'res=1920x1080',
                vData.playbackURL,
                '--save-dir', finalDir,
                '--save-name', fileName,
                '--tmp-dir', '.tmp',
                '--log-level', 'OFF'
            ]);
            downloadSuccess = true;
        } catch (error) {
            // Si falla 1080p, intentar con best
            console.log('No se encontró calidad 1080p, intentando con la mejor calidad disponible...');
            await runBinary('./N_m3u8DL-RE', [
                '-sv', 'for=best',
                vData.playbackURL,
                '--save-dir', finalDir,
                '--save-name', fileName,
                '--tmp-dir', '.tmp',
                '--log-level', 'OFF'
            ]);
            downloadSuccess = true;
        }

        if (downloadSuccess) {
            console.log('Video descargado correctamente');

            if (subtitle_lang) {
                console.log('Descargando subtítulos...');
                try {
                    await runBinary('./N_m3u8DL-RE', [
                        '--auto-subtitle-fix',
                        '--sub-format', 'SRT',
                        '--select-subtitle', `lang="${subtitle_lang}":for=all`,
                        vData.playbackURL,
                        '--save-dir', finalDir,
                        '--save-name', fileName,
                        '--tmp-dir', '.tmp',
                        '--log-level', 'OFF'
                    ]);

                    const subPath = path.join(finalDir, `${fileName}.${subtitle_lang}.srt`);
                    const videoPath = path.join(finalDir, `${fileName}.mp4`);
                    
                    if (fs.existsSync(subPath)) {
                        console.log('Subtítulos descargados, incrustando en el video...');
                        await embedSubtitles(videoPath, subPath);
                        console.log('Subtítulos incrustados correctamente');
                    } else {
                        console.log('No se encontraron subtítulos disponibles');
                    }
                } catch (error) {
                    console.error('Error procesando subtítulos:', error.message);
                }
            }
        }

        return true;
    } catch (error) {
        console.error('\nError detallado:', error);
        throw new Error(`Error descargando video: ${error.message}`);
    }
}

async function embedSubtitles(videoPath, subtitlePath) {
    try {
        const dir = path.dirname(videoPath);
        const filename = path.basename(videoPath, '.mp4');
        const outputPath = `${dir}/${filename}_with_subs.mp4`;
        const finalSrtPath = `${dir}/${filename}.srt`;

        // Crear una copia del archivo SRT con el mismo nombre que el video
        fs.copyFileSync(subtitlePath, finalSrtPath);

        await runBinary('ffmpeg', [
            '-i', videoPath,
            '-i', subtitlePath,
            '-c', 'copy',
            '-c:s', 'mov_text',
            outputPath
        ]);
        
        // Si todo salió bien, reemplazamos el archivo original
        fs.unlinkSync(videoPath);
        fs.renameSync(outputPath, videoPath);
        fs.unlinkSync(subtitlePath); // Eliminamos el SRT original (el temporal)
        
        // Ya no eliminamos el SRT final que copiamos
        
        return true;
    } catch (error) {
        console.error(`Error embedding subtitles: ${error}`);
        return false;
    }
}
