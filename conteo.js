const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const inquirer = require('inquirer');
const domestikaAuth = require('./auth.js');
const fs = require('fs');
const path = require('path');

// Función para normalizar URLs de Domestika (reutilizada de index.js)
function normalizeDomestikaUrl(url) {
    const courseRegex = /domestika\.org\/.*?\/courses\/(\d+[-\w]+)/;
    const match = url.match(courseRegex);
    
    if (match) {
        return `https://www.domestika.org/es/courses/${match[1]}/course`;
    }
    
    return url;
}

// Función para obtener datos de una unidad
async function getUnitData(url, page) {
    await page.goto(url);
    
    try {
        const data = await page.evaluate(() => window.__INITIAL_PROPS__);
        if (data && data.videos) {
            return data.videos.length;
        }
    } catch (error) {
        console.log('⚠️ Usando método alternativo para contar videos');
    }

    // Método alternativo: contar elementos de video en la página
    return await page.evaluate(() => {
        const selectors = [
            '.course-section__video',
            '.unit-video',
            '.video-player',
            '[class*="video-container"]'
        ];
        
        for (const selector of selectors) {
            const videos = document.querySelectorAll(selector);
            if (videos.length > 0) return videos.length;
        }
        return 0;
    });
}

// Función principal de conteo
async function contarVideos(courseUrl, auth, retryCount = 0) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000); // 60 segundos de timeout
    
    try {
        await page.setCookie(...auth.cookies);

        // Optimizar la carga de la página
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Agregar delay antes de cada navegación
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await page.goto(courseUrl, { waitUntil: 'networkidle0' });
        const html = await page.content();
        const $ = cheerio.load(html);

        // Intentar obtener el título con diferentes selectores
        let courseTitle;
        try {
            courseTitle = await page.evaluate(() => {
                const selectors = [
                    '.course-header-new__title-wrapper h1 a',
                    '.course-header-new__title a',
                    '.course-header__title a',
                    'h1 a',
                    'h1'
                ];
                
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) return element.textContent.trim();
                }
                return null;
            });
        } catch (error) {
            console.log('⚠️ No se pudo obtener el título del curso');
        }

        // Si no se encontró el título, usar la URL como identificador
        if (!courseTitle) {
            const courseId = courseUrl.match(/courses\/(\d+)/)?.[1] || 'desconocido';
            courseTitle = `Curso ${courseId}`;
            console.log(`⚠️ Usando título genérico: ${courseTitle}`);
        }

        const units = $('h4.h2.unit-item__title a, .unit-item__title a');

        if (units.length === 0) {
            if (retryCount < 3) {
                console.log(`\n⚠️ Reintentando curso (intento ${retryCount + 1}/3)...`);
                await browser.close();
                await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
                return contarVideos(courseUrl, auth, retryCount + 1);
            }
            console.log('\n❌ No se encontraron unidades después de 3 intentos.');
            return { totalUnits: 0, totalVideos: 0, courseTitle };
        }

        console.log(`\n📚 Analizando curso: ${courseTitle}`);
        console.log(`Unidades encontradas: ${units.length}`);

        let totalVideos = 0;
        const unitsDetails = [];

        for (let i = 0; i < units.length; i++) {
            const unitTitle = $(units[i]).text().trim();
            const unitUrl = $(units[i]).attr('href');
            
            // Agregar delay entre cada unidad
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                const videosInUnit = await getUnitData(unitUrl, page);
                unitsDetails.push({
                    unitNumber: i + 1,
                    title: unitTitle,
                    videos: videosInUnit
                });
                
                totalVideos += videosInUnit;
                console.log(`  Unidad ${i + 1}: ${unitTitle} (${videosInUnit} videos)`);
            } catch (error) {
                console.log(`  ⚠️ Error en Unidad ${i + 1}: ${unitTitle}`);
                unitsDetails.push({
                    unitNumber: i + 1,
                    title: unitTitle,
                    videos: 0
                });
            }
        }

        return {
            courseTitle,
            totalUnits: units.length,
            totalVideos,
            unitsDetails
        };

    } catch (error) {
        console.error(`Error procesando curso: ${error.message}`);
        return {
            courseTitle: courseUrl,
            totalUnits: 0,
            totalVideos: 0,
            error: error.message
        };
    } finally {
        await browser.close();
    }
}

async function main() {
    try {
        const auth = await domestikaAuth.getCookies();
        
        const answer = await inquirer.prompt([{
            type: 'input',
            name: 'courseUrls',
            message: 'URLs de los cursos (separadas por espacios):',
            validate: (input) => {
                const urls = input.trim().split(' ');
                return urls.every(url => url.match(/domestika\.org\/.*?\/courses\/\d+[-\w]+/)) 
                    || 'Por favor ingresa URLs válidas de cursos de Domestika';
            }
        }]);

        const courseUrls = answer.courseUrls
            .trim()
            .split(' ')
            .map(url => normalizeDomestikaUrl(url));

        let granTotal = 0;
        const resultados = [];
        const fecha = new Date().toISOString().split('T')[0];
        let contenido = `REPORTE DE CURSOS - ${fecha}\n\n`;

        // Procesar cursos secuencialmente con delay entre cada uno
        for (const url of courseUrls) {
            try {
                console.log(`\n🔍 Procesando curso: ${url}`);
                await new Promise(resolve => setTimeout(resolve, 3000)); // Esperar 3 segundos entre cursos
                
                const resultado = await contarVideos(url, auth);
                resultados.push(resultado);
                granTotal += resultado.totalVideos;

                // Agregar información detallada al contenido
                contenido += `\nCURSO: ${resultado.courseTitle}\n`;
                contenido += `URL: ${url}\n`;
                contenido += `Total de unidades: ${resultado.totalUnits}\n`;
                contenido += `Total de videos: ${resultado.totalVideos}\n`;
                
                if (resultado.unitsDetails) {
                    contenido += '\nDETALLE DE UNIDADES:\n';
                    resultado.unitsDetails.forEach(unit => {
                        contenido += `  ${unit.unitNumber}. ${unit.title}: ${unit.videos} videos\n`;
                    });
                }
                contenido += '\n' + '-'.repeat(50) + '\n';
            } catch (error) {
                console.error(`❌ Error procesando ${url}: ${error.message}`);
                resultados.push({
                    courseTitle: url,
                    totalUnits: 0,
                    totalVideos: 0,
                    error: error.message
                });
            }
        }

        // Agregar resumen final
        contenido += `\nRESUMEN FINAL:\n`;
        resultados.forEach(res => {
            contenido += `${res.courseTitle}:\n`;
            contenido += `  Unidades: ${res.totalUnits}\n`;
            contenido += `  Videos: ${res.totalVideos}\n\n`;
        });
        contenido += `\nTOTAL DE VIDEOS DE TODOS LOS CURSOS: ${granTotal}\n`;

        // Crear directorio de reportes si no existe
        const reportDir = 'reportes';
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir);
        }

        // Guardar el reporte
        const nombreArchivo = `reporte_cursos_${fecha}.txt`;
        fs.writeFileSync(path.join(reportDir, nombreArchivo), contenido);
        console.log(`\n📝 Reporte guardado en: ${path.join(reportDir, nombreArchivo)}`);

        // Mostrar resumen en consola
        console.log('\n📊 RESUMEN FINAL:');
        resultados.forEach(res => {
            console.log(`\n${res.courseTitle}:`);
            console.log(`  Unidades: ${res.totalUnits}`);
            console.log(`  Videos totales: ${res.totalVideos}`);
        });

        console.log(`\n🎯 TOTAL DE VIDEOS DE TODOS LOS CURSOS: ${granTotal}`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
} 