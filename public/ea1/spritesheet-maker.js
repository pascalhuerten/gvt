
(function () {
    'use strict';
    const input = document.getElementById('files');
    const makeBtn = document.getElementById('make');
    const downloadBtn = document.getElementById('download');
    const status = document.getElementById('status');
    const out = document.getElementById('out');
    const perRowInput = document.getElementById('perRow');
    const paddingInput = document.getElementById('padding');

    function numericKey(name) {
        // extract the first group of digits from filename, fallback to 0
        const m = name.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
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

    makeBtn.addEventListener('click', async () => {
        const files = Array.from(input.files || []);
        if (files.length === 0) { status.textContent = 'Please select files.'; return; }

        // Sort files numerically by filename
        files.sort((a, b) => numericKey(a.name) - numericKey(b.name));

        status.textContent = 'Loading images...';
        try {
            const imgs = await Promise.all(files.map(readImage));

            // compute frame size: ensure all same size, otherwise use max
            const frameW = Math.max(...imgs.map(i => i.naturalWidth));
            const frameH = Math.max(...imgs.map(i => i.naturalHeight));
            const padding = Math.max(0, parseInt(paddingInput.value, 10) || 0);
            const perRow = Math.max(0, parseInt(perRowInput.value, 10) || 0);

            let cols = imgs.length;
            let rows = 1;
            if (perRow > 0) { cols = perRow; rows = Math.ceil(imgs.length / perRow); }

            const w = cols * frameW + Math.max(0, cols - 1) * padding;
            const h = rows * frameH + Math.max(0, rows - 1) * padding;

            out.width = w; out.height = h;
            const ctx = out.getContext('2d');
            ctx.clearRect(0, 0, w, h);

            imgs.forEach((img, idx) => {
                const col = perRow > 0 ? (idx % perRow) : idx;
                const row = perRow > 0 ? Math.floor(idx / perRow) : 0;
                const x = col * (frameW + padding);
                const y = row * (frameH + padding);
                // draw centered in frame if sizes differ
                const dx = x + Math.floor((frameW - img.naturalWidth) / 2);
                const dy = y + Math.floor((frameH - img.naturalHeight) / 2);
                ctx.drawImage(img, dx, dy);
            });

            status.textContent = `Spritesheet created: ${imgs.length} frames — ${w}×${h}px`;
            downloadBtn.disabled = false;
        } catch (err) {
            console.error(err);
            status.textContent = 'Error loading images: see console.';
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

})();
