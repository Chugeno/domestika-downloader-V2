Resumen de Cambios
1. Visualización del Árbol Completo: Se ha modificado la lógica para que al seleccionar videos específicos, se muestre un árbol completo donde cada unidad se presenta junto con sus videos, tabulados.
2. Selección de Videos: El usuario puede seleccionar videos directamente desde la lista completa, lo que facilita la elección.
Ejemplo de Interacción
Cuando el usuario elige "Videos específicos", verá algo como esto:
V2
Con estos cambios, el programa ahora permite una selección más clara y estructurada de las unidades y videos. Si necesitas más ajustes o tienes preguntas sobre alguna parte del código, ¡dímelo!

// ... código existente ...

// Modificar la función scrapeSite para manejar la opción de descarga
async function scrapeSite(courseUrl, subtitle_lang, auth, downloadOption) {
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
    let courseTitle = $('h1.course-header-new__title')
        .text()
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '-');

    // Verificar si estamos en la página correcta
    if (units.length === 0) {
        await page.close();
        await browser.close();
        console.log('\n❌ No se encontraron videos. Esto puede deberse a cookies inválidas.');
        // Manejo de cookies inválidas...
        return;
    }

    console.log(units.length + ' Unidades detectadas');

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
        // Mostrar el árbol completo de unidades y videos
        const choices = allVideos.flatMap(unit => {
            return [
                { name: unit.title, value: unit.title, short: unit.title },
                ...unit.videoData.map(video => ({
                    name: `  ${video.title}`, // Tabulado para mostrar como subelemento
                    value: video,
                    short: video.title
                }))
            ];
        });

        const selectedVideos = await inquirer.prompt([
            {
                type: 'checkbox',
                name: 'videosToDownload',
                message: 'Selecciona los videos que deseas descargar:',
                choices: choices
            }
        ]);

        // Descargar solo los videos seleccionados
        for (const vData of selectedVideos.videosToDownload) {
            await downloadVideo(vData, courseTitle, vData.unitTitle, vData.unitNumber, subtitle_lang, vData.unitNumber);
        }
    } else {
        // Descargar todos los videos
        for (let i = 0; i < allVideos.length; i++) {
            const unit = allVideos[i];
            for (let a = 0; a < unit.videoData.length; a++) {
                const vData = unit.videoData[a];
                await downloadVideo(vData, courseTitle, unit.title, a + 1, subtitle_lang, unit.unitNumber);
            }
        }
    }

    await page.close();
    await browser.close();
}

// ... resto del código existente ...