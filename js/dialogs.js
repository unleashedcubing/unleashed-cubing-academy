(function () {
    let activeResolve = null;

    function ensureDialog() {
        let root = document.getElementById('uc-dialog');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'uc-dialog';
        root.className = 'uc-dialog-backdrop';
        root.hidden = true;
        root.innerHTML = `
            <section class="uc-dialog-card" role="dialog" aria-modal="true" aria-labelledby="uc-dialog-title">
                <div class="uc-dialog-glow"></div>
                <div class="uc-dialog-icon" id="uc-dialog-icon">!</div>
                <div class="uc-dialog-copy">
                    <h2 id="uc-dialog-title">Notice</h2>
                    <p id="uc-dialog-message"></p>
                </div>
                <input id="uc-dialog-input" class="uc-dialog-input" type="text" hidden>
                <div class="uc-dialog-actions">
                    <button type="button" class="uc-dialog-secondary" id="uc-dialog-cancel">Cancel</button>
                    <button type="button" class="uc-dialog-primary" id="uc-dialog-confirm">OK</button>
                </div>
            </section>`;
        document.body.appendChild(root);
        root.querySelector('#uc-dialog-confirm').addEventListener('click', () => settle(true));
        root.querySelector('#uc-dialog-cancel').addEventListener('click', () => settle(false));
        root.addEventListener('click', (event) => {
            if (event.target === root && root.dataset.kind !== 'alert') settle(false);
        });
        root.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') settle(false);
            if (event.key === 'Enter') settle(true);
        });
        return root;
    }

    function settle(confirmed) {
        const root = ensureDialog();
        const input = root.querySelector('#uc-dialog-input');
        const kind = root.dataset.kind;
        const value = kind === 'prompt' ? (confirmed ? input.value : null) : confirmed;
        root.classList.remove('is-open');
        root.hidden = true;
        const resolve = activeResolve;
        activeResolve = null;
        if (resolve) resolve(value);
    }

    function open(options) {
        const root = ensureDialog();
        if (activeResolve) activeResolve(options.kind === 'prompt' ? null : false);
        root.dataset.kind = options.kind;
        root.dataset.tone = options.tone || 'neutral';
        root.querySelector('#uc-dialog-title').textContent = options.title || 'Notice';
        root.querySelector('#uc-dialog-message').textContent = String(options.message || '');
        root.querySelector('#uc-dialog-icon').textContent = options.icon || (options.tone === 'danger' ? '!' : 'i');
        const input = root.querySelector('#uc-dialog-input');
        input.hidden = options.kind !== 'prompt';
        input.type = options.secret ? 'password' : 'text';
        input.value = options.defaultValue || '';
        input.placeholder = options.placeholder || '';
        const cancel = root.querySelector('#uc-dialog-cancel');
        cancel.hidden = options.kind === 'alert';
        cancel.textContent = options.cancelLabel || 'Cancel';
        const confirm = root.querySelector('#uc-dialog-confirm');
        confirm.textContent = options.confirmLabel || 'OK';
        root.hidden = false;
        requestAnimationFrame(() => root.classList.add('is-open'));
        setTimeout(() => (options.kind === 'prompt' ? input : confirm).focus(), 30);
        return new Promise((resolve) => { activeResolve = resolve; });
    }

    window.ucAlert = (message, options = {}) => open({ kind: 'alert', message, ...options });
    window.ucConfirm = (message, options = {}) => open({ kind: 'confirm', message, title: 'Are you sure?', confirmLabel: 'Confirm', tone: 'danger', ...options });
    window.ucPrompt = (message, defaultValue = '', options = {}) => open({ kind: 'prompt', message, defaultValue, title: 'Enter details', confirmLabel: 'Save', ...options });
    window.alert = (message) => { window.ucAlert(message); };
})();
