(function () {
    'use strict';
    const input = document.getElementById('files');
    const makeBtn = document.getElementById('make');
    const downloadBtn = document.getElementById('download');
    const status = document.getElementById('status');
    const out = document.getElementById('out');
    const perRowInput = document.getElementById('perRow');
    const paddingInput = document.getElementById('padding');
    const autoSortCheckbox = document.getElementById('autoSort');
    const fileList = document.getElementById('fileList');

    let filesArray = [];

    function numericKey(name) {
        const matches = name.match(/\d+/g);
        if (!matches) return [0];
        return matches.map(num => parseInt(num, 10));
    }

    function compareNumeric(a, b) {
        const keysA = numericKey(a.name);
        const keysB = numericKey(b.name);
        for (let i = 0; i < Math.max(keysA.length, keysB.length); i++) {
            const numA = keysA[i] || 0;
            const numB = keysB[i] || 0;
            if (numA !== numB) return numA - numB;
        }
        return a.name.localeCompare(b.name);
    }

    function readImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            img.src = url;
        });
    }

    function renderFileList() {
        fileList.innerHTML = '';
        if (filesArray.length === 0) {
            fileList.innerHTML = '<li>(keine Dateien ausgewählt)</li>';
            return;
        }

        filesArray.forEach((f, idx) => {
            const li = document.createElement('li');
            li.className = 'file-item';
            // Thumbnail
            const img = document.createElement('img');
            img.alt = f.name;
            img.width = 64;
            img.height = 64;
            const url = URL.createObjectURL(f);
            img.onload = () => URL.revokeObjectURL(url);
            img.src = url;

            const info = document.createElement('span');
            info.textContent = ` ${idx + 1}. ${f.name}`;

            const up = document.createElement('button');
            up.type = 'button';
            up.textContent = '↑';
            up.title = 'Nach oben';
            up.dataset.idx = idx;

            const down = document.createElement('button');
            down.type = 'button';
            down.textContent = '↓';
            down.title = 'Nach unten';
            down.dataset.idx = idx;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '✖';
            remove.title = 'Entfernen';
            remove.dataset.idx = idx;

            li.appendChild(img);
            li.appendChild(info);
            li.appendChild(up);
            li.appendChild(down);
            li.appendChild(remove);
            fileList.appendChild(li);
        });
    }

    fileList.addEventListener('click', (e) => {
        const btn = e.target;
        if (!(btn.tagName === 'BUTTON')) return;
        const idx = Number(btn.dataset.idx);
        if (Number.isNaN(idx)) return;

        if (btn.textContent === '↑' && idx > 0) {
            const tmp = filesArray[idx - 1];
            filesArray[idx - 1] = filesArray[idx];
            filesArray[idx] = tmp;
            renderFileList();
        } else if (btn.textContent === '↓' && idx < filesArray.length - 1) {
            const tmp = filesArray[idx + 1];
            filesArray[idx + 1] = filesArray[idx];
            filesArray[idx] = tmp;
            renderFileList();
        } else if (btn.textContent === '✖') {
            filesArray.splice(idx, 1);
            renderFileList();
        }
    });

    input.addEventListener('change', () => {
        filesArray = Array.from(input.files || []);
        if (autoSortCheckbox.checked) filesArray.sort(compareNumeric);
        renderFileList();
        downloadBtn.disabled = true;
        status.textContent = `${filesArray.length} Datei(en) ausgewählt`;
    });

    autoSortCheckbox.addEventListener('change', () => {
        if (autoSortCheckbox.checked) {
            filesArray.sort(compareNumeric);
            renderFileList();
        }
    });

    makeBtn.addEventListener('click', async () => {
        if (filesArray.length === 0) {
            status.textContent = 'Bitte wählen Sie Dateien aus.';
            return;
        }

        status.textContent = 'Lade Bilder...';
        try {
            const imgs = await Promise.all(filesArray.map(readImage));

            const frameW = Math.max(...imgs.map(i => i.naturalWidth));
            const frameH = Math.max(...imgs.map(i => i.naturalHeight));
            const padding = Math.max(0, parseInt(paddingInput.value, 10) || 0);
            const perRow = Math.max(0, parseInt(perRowInput.value, 10) || 0);

            let cols = imgs.length;
            let rows = 1;
            if (perRow > 0) {
                cols = perRow;
                rows = Math.ceil(imgs.length / perRow);
            }

            const w = cols * frameW + Math.max(0, cols - 1) * padding;
            const h = rows * frameH + Math.max(0, rows - 1) * padding;

            out.width = w;
            out.height = h;
            const ctx = out.getContext('2d');
            ctx.clearRect(0, 0, w, h);

            imgs.forEach((img, idx) => {
                const col = perRow > 0 ? (idx % perRow) : idx;
                const row = perRow > 0 ? Math.floor(idx / perRow) : 0;
                const x = col * (frameW + padding);
                const y = row * (frameH + padding);
                const dx = x + Math.floor((frameW - img.naturalWidth) / 2);
                const dy = y + Math.floor((frameH - img.naturalHeight) / 2);
                ctx.drawImage(img, dx, dy);
            });

            status.textContent = `Spritesheet erstellt: ${imgs.length} Frames — ${w}×${h}px`;
            downloadBtn.disabled = false;
        } catch (err) {
            console.error(err);
            status.textContent = 'Fehler beim Laden der Bilder: siehe Konsole.';
        }
    });

    downloadBtn.addEventListener('click', () => {
        const url = out.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = 'spritesheet.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
    });

    // initial render
    renderFileList();

})();