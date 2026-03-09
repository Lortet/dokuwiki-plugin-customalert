(function () {
    function initializeAdmnoteProsemirror() {
        if (window.__admnoteProsemirrorInitialized) return;
        if (!window.Prosemirror || !window.Prosemirror.classes) return;
        window.__admnoteProsemirrorInitialized = true;

    const {classes: {MenuItem, AbstractMenuItemDispatcher}} = window.Prosemirror;
    function hiddenMenuItem() {
        return new MenuItem({
            label: '',
            render: () => {
                const el = document.createElement('span');
                el.style.display = 'none';
                return el;
            },
            command: () => false
        });
    }

    function getPencilMenuIcon() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zm17.71-10.04a1.003 1.003 0 000-1.42l-2.5-2.5a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 2-1.66z');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);

        const wrapper = document.createElement('span');
        wrapper.className = 'menuicon';
        wrapper.appendChild(svg);
        return wrapper;
    }

    function getTrashMenuIcon() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);

        const wrapper = document.createElement('span');
        wrapper.className = 'menuicon';
        wrapper.appendChild(svg);
        return wrapper;
    }
    const ADMNOTE_TYPES = [
        'abstract', 'bug', 'danger', 'example', 'failure', 'information',
        'note', 'question', 'quote', 'achievement', 'tip', 'warning'
    ];

    function normalizeType(type) {
        const normalized = String(type || 'note').toLowerCase();
        if (normalized === 'info') return 'information';
        if (normalized === 'success') return 'achievement';
        return normalized;
    }

    function labelForType(type) {
        const normalized = normalizeType(type);
        const key = 'adm_' + normalized;
        const localized = (
            window.LANG &&
            LANG.plugins &&
            LANG.plugins.admnote &&
            LANG.plugins.admnote[key]
        ) || '';
        if (localized) return String(localized);
        return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    function isSelectionInsideCodeOrTable(state) {
        if (!state || !state.selection || !state.selection.$from) return false;
        const blocked = new Set([
            'code_block',
            'preformatted',
            'table',
            'table_row',
            'table_cell',
            'table_header'
        ]);

        const $from = state.selection.$from;
        for (let depth = $from.depth; depth >= 0; depth -= 1) {
            const node = $from.node(depth);
            const typeName = node && node.type ? node.type.name : '';
            if (blocked.has(typeName)) return true;
        }
        return false;
    }

    window.Prosemirror.pluginSchemas.push((nodes, marks) => {
        let admnoteTitle = {
            content: 'text*',
            marks: '',
            toDOM: (node) => {
                return ['div', { class: 'admonition-title' }, 0];
            },
            parseDOM: [
                { tag: 'div.admonition-title' }
            ]
        };
        nodes = nodes.addToEnd('admnote_title', admnoteTitle);

        let admnoteContent = {
            // Internal container for admnote body.
            // Keep it restricted to regular block nodes and explicitly allow
            // commonly used structures when some schemas don't expose `group: block`.
            content: '(block|bullet_list|ordered_list|table|blockquote|code_block|preformatted)*',
            toDOM: (node) => {
                return ['div', { class: 'admonition-content', style: 'min-height:50px;padding:10px;' }, 0];
            },
            parseDOM: [
                { tag: 'div.admonition-content' }
            ]
        };
        nodes = nodes.addToEnd('admnote_content', admnoteContent);

        let admnoteSchema = {
            group: 'block',
            content: 'admnote_title admnote_content',
            attrs: {
                type: { default: 'question' }
            },
            selectable: false,
            draggable: false,
            toDOM: (node) => {
                return [
                    'div',
                    { class: 'admonition ' + node.attrs.type },
                    0
                ];
            },
            parseDOM: [
                { tag: 'div.admonition' }
            ]
        };
        nodes = nodes.addToEnd('admnote', admnoteSchema);


        window.debugSchemas = nodes;
        window.debugSchemasM = marks;

        return {nodes: nodes, marks: marks};
    });

    class AdmnoteNodeView {
        constructor(node, outerView, getPos) {
            this.node = node;
            this.outerView = outerView;
            this.getPos = getPos;
            this.onKeyDown = this.onKeyDown.bind(this);
            this.onContentMouseDown = this.onContentMouseDown.bind(this);

            this.dom = document.createElement('div');
            this.dom.className = 'admnote-pm-nodeview';

            this.toolbar = document.createElement('div');
            this.toolbar.className = 'admnote-pm-toolbar';
            this.toolbar.style.cssText = 'display:flex;justify-content:flex-start;padding:4px 8px 0;';
            this.toolbar.setAttribute('contenteditable', 'false');

            this.select = document.createElement('select');
            this.select.className = 'admnote-pm-type';
            this.select.style.cssText = 'font-size:12px;max-width:140px;';
            ADMNOTE_TYPES.forEach((type) => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = labelForType(type);
                this.select.appendChild(option);
            });
            this.select.value = normalizeType(node.attrs.type || 'note');
            this.select.addEventListener('change', () => this.updateType(this.select.value));

            this.toolbar.appendChild(this.select);

            this.deleteBtn = document.createElement('button');
            this.deleteBtn.type = 'button';
            this.deleteBtn.className = 'admnote-pm-delete';
            this.deleteBtn.title = 'Delete admnote';
            this.deleteBtn.setAttribute('aria-label', 'Delete admnote');
            this.deleteBtn.style.cssText = 'margin-left:8px;display:inline-flex;align-items:center;justify-content:center;background:none;border:1px solid #bbb;border-radius:4px;padding:2px 6px;cursor:pointer;';
            this.deleteBtn.appendChild(getTrashMenuIcon());
            this.deleteBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.deleteNode();
            });
            this.toolbar.appendChild(this.deleteBtn);

            this.exitBtn = document.createElement('button');
            this.exitBtn.type = 'button';
            this.exitBtn.className = 'admnote-pm-exit';
            this.exitBtn.title = 'Exit admnote';
            this.exitBtn.setAttribute('aria-label', 'Exit admnote');
            this.exitBtn.style.cssText = 'margin-left:8px;display:inline-flex;align-items:center;justify-content:center;background:none;border:1px solid #bbb;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:12px;';
            this.exitBtn.textContent = 'Ctrl+Enter';
            this.exitBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.insertParagraphAfterNode();
            });
            this.toolbar.appendChild(this.exitBtn);

            this.dom.appendChild(this.toolbar);

            this.admDom = document.createElement('div');
            this.admDom.className = 'admonition ' + (node.attrs.type || 'note');
            const exitHint = (
                window.LANG &&
                LANG.plugins &&
                LANG.plugins.prosemirror &&
                LANG.plugins.prosemirror.code_block_hint
            ) || 'Press CTRL+Enter to exit';
            this.admDom.setAttribute('data-exithint', exitHint);
            this.dom.appendChild(this.admDom);

            this.exitHint = document.createElement('div');
            this.exitHint.className = 'admnote-pm-exithint';
            this.exitHint.setAttribute('contenteditable', 'false');
            this.exitHint.style.cssText = 'font-size:11px;line-height:1.3;color:#777;padding:4px 10px 8px;text-align:right;user-select:none;';
            this.exitHint.textContent = exitHint;
            this.dom.appendChild(this.exitHint);

            this.dom.addEventListener('keydown', this.onKeyDown, true);
            this.admDom.addEventListener('keydown', this.onKeyDown, true);
            this.admDom.addEventListener('mousedown', this.onContentMouseDown);

            // Keep admnote children as direct descendants of .admonition
            // so rules like ".admonition.failure > .admonition-title" work.
            this.contentDOM = this.admDom;
        }

        onKeyDown(event) {
            if (!event) return;
            const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
            const hasModifier = !!event.ctrlKey || !!event.metaKey;
            if (!(hasModifier && isEnter)) return;
            if (isSelectionInsideCodeOrTable(this.outerView.state)) return;

            event.preventDefault();
            event.stopPropagation();
            this.insertParagraphAfterNode();
        }

        insertParagraphAfterNode() {
            const pos = this.getPos();
            if (typeof pos !== 'number') return;

            const state = this.outerView.state;
            const schema = state.schema;
            if (!schema || !schema.nodes || !schema.nodes.paragraph) return;

            const paragraph = schema.nodes.paragraph.createAndFill();
            if (!paragraph) return;

            let insertPos = pos + this.node.nodeSize;
            let tr = state.tr;
            try {
                tr = tr.insert(insertPos, paragraph);
            } catch (e) {
                // Fallback for edge cases (e.g. end-of-doc mapping issues).
                insertPos = state.doc.content.size;
                tr = state.tr.insert(insertPos, paragraph);
            }

            const TextSelection = window.Prosemirror &&
                window.Prosemirror.classes &&
                window.Prosemirror.classes.TextSelection;
            if (TextSelection && typeof TextSelection.create === 'function') {
                try {
                    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
                } catch (e) {
                    // Selection fallback: dispatch inserted paragraph without explicit cursor move.
                }
            }

            this.outerView.dispatch(tr.scrollIntoView());
            this.outerView.focus();
        }

        isContentEmpty() {
            if (!this.node || this.node.childCount < 2) return true;
            const contentNode = this.node.child(1);
            return !contentNode || contentNode.childCount === 0;
        }

        ensureParagraphInEmptyContent() {
            if (!this.isContentEmpty()) return true;

            const pos = this.getPos();
            if (typeof pos !== 'number') return false;

            const state = this.outerView.state;
            const schema = state.schema;
            if (!schema || !schema.nodes || !schema.nodes.paragraph) return false;

            const paragraph = schema.nodes.paragraph.createAndFill();
            if (!paragraph) return false;

            const titleNode = this.node.childCount > 0 ? this.node.child(0) : null;
            const contentPos = pos + 1 + (titleNode ? titleNode.nodeSize : 0);
            const insertPos = contentPos + 1; // first position inside admnote_content

            let tr = state.tr.insert(insertPos, paragraph);
            const TextSelection = window.Prosemirror &&
                window.Prosemirror.classes &&
                window.Prosemirror.classes.TextSelection;
            if (TextSelection && typeof TextSelection.create === 'function') {
                tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
            }
            this.outerView.dispatch(tr.scrollIntoView());
            this.outerView.focus();
            return true;
        }

        onContentMouseDown(event) {
            if (!event) return;
            if (this.toolbar && this.toolbar.contains(event.target)) return;
            if (!this.isContentEmpty()) return;

            event.preventDefault();
            event.stopPropagation();
            this.ensureParagraphInEmptyContent();
        }

        updateType(newType) {
            const pos = this.getPos();
            const attrs = {...this.node.attrs, type: normalizeType(newType)};
            this.outerView.dispatch(this.outerView.state.tr.setNodeMarkup(pos, null, attrs, this.node.marks));
            this.outerView.focus();
        }

        deleteNode() {
            const label = (this.node && this.node.attrs && this.node.attrs.type)
                ? String(this.node.attrs.type)
                : 'admnote';
            if (!window.confirm('Delete this ' + label + ' block?')) {
                return;
            }

            const pos = this.getPos();
            if (typeof pos !== 'number') return;
            const tr = this.outerView.state.tr.delete(pos, pos + this.node.nodeSize);
            this.outerView.dispatch(tr.scrollIntoView());
            this.outerView.focus();
        }

        update(node) {
            if (!node || node.type.name !== 'admnote') return false;
            this.node = node;
            const type = normalizeType(node.attrs.type || 'note');
            this.admDom.className = 'admonition ' + type;

            // Defensive: if ProseMirror rewrites parts of the DOM, restore toolbar placement.
            if (!this.dom.contains(this.toolbar)) {
                this.dom.insertBefore(this.toolbar, this.dom.firstChild || null);
            }
            if (!this.dom.contains(this.admDom)) {
                this.dom.appendChild(this.admDom);
            }

            if (this.select.value !== type) {
                this.select.value = type;
            }
            return true;
        }

        stopEvent(event) {
            return !!(event && (event.target === this.select || event.target === this.deleteBtn || event.target === this.exitBtn || this.toolbar.contains(event.target)));
        }

        ignoreMutation() {
            return false;
        }

        destroy() {
            if (this.dom) {
                this.dom.removeEventListener('keydown', this.onKeyDown, true);
            }
            if (this.admDom) {
                this.admDom.removeEventListener('keydown', this.onKeyDown, true);
                this.admDom.removeEventListener('mousedown', this.onContentMouseDown);
            }
        }
    }

    class AdmnoteMenuItemDispatcher extends AbstractMenuItemDispatcher {
        static isAvailable(schema) {
            return !!(
                schema.nodes.admnote &&
                schema.nodes.admnote_title &&
                schema.nodes.admnote_content &&
                schema.nodes.paragraph
            );
        }

        static createAdmnoteNode(schema, type = 'note') {
            const titleNode = schema.nodes.admnote_title.create(
                null,
                schema.text(labelForType(type))
            );
            const paragraphNode = schema.nodes.paragraph.createAndFill();
            const contentNode = schema.nodes.admnote_content.create(
                null,
                paragraphNode ? [paragraphNode] : undefined
            );
            return schema.nodes.admnote.create({type}, [titleNode, contentNode]);
        }

        static getMenuItem(schema) {
            if (!this.isAvailable(schema)) return hiddenMenuItem();
            return new MenuItem({
                label: 'Admnote',
                icon: getPencilMenuIcon(),
                render: () => {
                    const item = document.createElement('span');
                    item.className = 'menuitem admnote-direct-item';
                    item.appendChild(getPencilMenuIcon());
                    const label = document.createElement('span');
                    label.className = 'menulabel';
                    label.setAttribute('title', 'Admnote');
                    label.textContent = 'Admnote';
                    item.appendChild(label);
                    return item;
                },
                command: (state, dispatch, view) => {
                    const node = this.createAdmnoteNode(schema, 'note');
                    if (!node) return false;

                    // Keep the menu item enabled; ProseMirror calls command()
                    // with dispatch=null for "can execute" checks.
                    if (!dispatch || !view) return true;

                    const {$from} = state.selection;
                    const index = $from.index();

                    if ($from.parent.canReplaceWith(index, index, schema.nodes.admnote)) {
                        dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
                        return true;
                    }

                    for (let depth = $from.depth; depth > 0; depth -= 1) {
                        const insertPos = $from.after(depth);
                        try {
                            dispatch(state.tr.insert(insertPos, node).scrollIntoView());
                            return true;
                        } catch (e) {
                            // try a higher ancestor
                        }
                    }

                    return false;
                }
            });
        }
    }

    function findAdmnoteAtSelection(state) {
        if (!state || !state.selection) return null;
        const {selection} = state;
        if (selection.node && selection.node.type && selection.node.type.name === 'admnote') {
            return {node: selection.node, pos: selection.from};
        }

        const $from = selection.$from;
        if (!$from) return null;

        if ($from.depth > 0 && $from.parent && $from.parent.type && $from.parent.type.name === 'admnote') {
            return {node: $from.parent, pos: $from.before($from.depth)};
        }
        if ($from.nodeBefore && $from.nodeBefore.type && $from.nodeBefore.type.name === 'admnote') {
            return {node: $from.nodeBefore, pos: $from.pos - $from.nodeBefore.nodeSize};
        }
        if ($from.nodeAfter && $from.nodeAfter.type && $from.nodeAfter.type.name === 'admnote') {
            return {node: $from.nodeAfter, pos: $from.pos};
        }

        for (let depth = $from.depth; depth > 0; depth -= 1) {
            const ancestor = $from.node(depth);
            if (ancestor && ancestor.type && ancestor.type.name === 'admnote') {
                return {node: ancestor, pos: $from.before(depth)};
            }
        }
        return null;
    }

    function insertParagraphAfterSelectedAdmnote(view) {
        if (!view || !view.state) return false;
        const selected = findAdmnoteAtSelection(view.state);
        if (!selected) return false;

        const {schema} = view.state;
        const paragraph = schema && schema.nodes && schema.nodes.paragraph
            ? schema.nodes.paragraph.createAndFill()
            : null;
        if (!paragraph) return false;

        const insertPos = selected.pos + selected.node.nodeSize;
        let tr = view.state.tr.insert(insertPos, paragraph).scrollIntoView();
        view.dispatch(tr);

        try {
            const SelectionClass = view.state.selection.constructor;
            const $target = view.state.doc.resolve(insertPos + 1);
            const nextSel = SelectionClass.near($target, 1);
            view.dispatch(view.state.tr.setSelection(nextSel).scrollIntoView());
        } catch (e) {
            // Keep default selection when explicit cursor move fails.
        }

        view.focus();
        return true;
    }

    window.Prosemirror.pluginNodeViews.admnote = function admnote(node, outerView, getPos) {
        return new AdmnoteNodeView(node, outerView, getPos);
    };

    window.Prosemirror.pluginMenuItemDispatchers.push(AdmnoteMenuItemDispatcher);

    function moveAdmnoteButtonToMenubar() {
        const wrappers = document.querySelectorAll('.prosemirror_wrapper');
        wrappers.forEach((wrapper) => {
            const menubar = wrapper.querySelector('.menubar');
            if (!menubar) return;

            const button = wrapper.querySelector('.menuitem.admnote-direct-item');
            if (!button) return;

            if (button.parentElement !== menubar) {
                menubar.appendChild(button);
            }
        });
    }

    let admnoteMoveScheduled = false;
    function scheduleAdmnoteMove() {
        if (admnoteMoveScheduled) return;
        admnoteMoveScheduled = true;
        window.requestAnimationFrame(() => {
            admnoteMoveScheduled = false;
            moveAdmnoteButtonToMenubar();
        });
    }

    const admnoteObserver = new MutationObserver((mutations) => {
        if (!mutations || !mutations.length) return;
        scheduleAdmnoteMove();
    });
    admnoteObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    scheduleAdmnoteMove();

    if (!window.__admnoteKeyboardGuardInstalled) {
        window.__admnoteKeyboardGuardInstalled = true;
        document.addEventListener('keydown', (event) => {
            if (!event) return;
            const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter';
            const hasModifier = !!event.ctrlKey || !!event.metaKey;
            if (!(hasModifier && isEnter)) return;

            const view = window.Prosemirror && window.Prosemirror.view;
            if (!view || !view.state) return;
            if (!findAdmnoteAtSelection(view.state)) return;
            if (isSelectionInsideCodeOrTable(view.state)) return;

            event.preventDefault();
            event.stopPropagation();
            insertParagraphAfterSelectedAdmnote(view);
        }, true);
    }
    }

    jQuery(document).on('PROSEMIRROR_API_INITIALIZED', initializeAdmnoteProsemirror);
    initializeAdmnoteProsemirror();
})();
