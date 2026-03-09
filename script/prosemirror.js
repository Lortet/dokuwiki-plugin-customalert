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

    function getChevronMenuIcon() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);

        return svg;
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

    function normalizeCollapse(value) {
        const normalized = String(value || 'open').toLowerCase();
        if (normalized === 'open' || normalized === 'close') return normalized;
        return 'open';
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

    function getTypeIconMeta(type) {
        const normalized = normalizeType(type);
        const metaMap = {
            abstract: {color: '#00b0ff', mask: 'var(--adm-abstract-pic)'},
            bug: {color: '#f50057', mask: 'var(--adm-bug-pic)'},
            danger: {color: '#ff1744', mask: 'var(--adm-danger-pic)'},
            example: {color: '#651fff', mask: 'var(--adm-example-pic)'},
            failure: {color: '#ff5252', mask: 'var(--adm-failure-pic)'},
            information: {color: '#00b8d4', mask: 'var(--adm-information-pic)'},
            note: {color: '#448aff', mask: 'var(--adm-note-pic)'},
            question: {color: '#64dd17', mask: 'var(--adm-question-pic)'},
            quote: {color: '#9e9e9e', mask: 'var(--adm-quote-pic)'},
            achievement: {color: '#00c853', mask: 'var(--adm-achievement-pic)'},
            tip: {color: '#00bfa5', mask: 'var(--adm-tip-pic)'},
            warning: {color: '#ff9100', mask: 'var(--adm-warning-pic)'}
        };
        return metaMap[normalized] || metaMap.note;
    }

    function createTypeIconElement(type, sizePx = 16) {
        const meta = getTypeIconMeta(type);
        const el = document.createElement('span');
        el.style.cssText = [
            'display:inline-block',
            'width:' + sizePx + 'px',
            'height:' + sizePx + 'px',
            'background-color:' + meta.color,
            '-webkit-mask-image:' + meta.mask,
            'mask-image:' + meta.mask,
            '-webkit-mask-repeat:no-repeat',
            'mask-repeat:no-repeat',
            '-webkit-mask-size:contain',
            'mask-size:contain',
            '-webkit-mask-position:center',
            'mask-position:center'
        ].join(';');
        return el;
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
                type: { default: 'question' },
                collapse: { default: 'open' }
            },
            selectable: false,
            draggable: false,
            toDOM: (node) => {
                return [
                    'div',
                    {
                        class: 'admonition ' + node.attrs.type,
                        'data-collapse': normalizeCollapse(node.attrs.collapse || 'open')
                    },
                    0
                ];
            },
            parseDOM: [
                {
                    tag: 'div.admonition',
                    getAttrs: (dom) => ({
                        collapse: normalizeCollapse(dom.getAttribute('data-collapse') || 'open')
                    })
                },
                {
                    tag: 'details.admonition',
                    getAttrs: (dom) => ({
                        collapse: dom.hasAttribute('open') ? 'open' : 'close'
                    })
                }
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

            this.collapseSelect = document.createElement('select');
            this.collapseSelect = document.createElement('label');
            this.collapseSelect.className = 'admnote-pm-collapse';
            this.collapseSelect.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;margin-left:8px;cursor:pointer;';
            this.collapseCheckbox = document.createElement('input');
            this.collapseCheckbox.type = 'checkbox';
            this.collapseCheckbox.checked = normalizeCollapse(node.attrs.collapse || 'open') === 'close';
            this.collapseCheckbox.addEventListener('change', () => {
                this.updateCollapse(this.collapseCheckbox.checked ? 'close' : 'open');
            });
            const collapseLabel = document.createElement('span');
            collapseLabel.textContent = 'fermé';
            this.collapseSelect.appendChild(this.collapseCheckbox);
            this.collapseSelect.appendChild(collapseLabel);
            this.toolbar.appendChild(this.collapseSelect);

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

        updateCollapse(newCollapse) {
            const pos = this.getPos();
            const attrs = {...this.node.attrs, collapse: normalizeCollapse(newCollapse)};
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
            const collapse = normalizeCollapse(node.attrs.collapse || 'open');
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
            if (this.collapseCheckbox) {
                this.collapseCheckbox.checked = collapse === 'close';
            }
            return true;
        }

        stopEvent(event) {
            return !!(
                event &&
                (
                    event.target === this.select ||
                    event.target === this.collapseSelect ||
                    event.target === this.collapseCheckbox ||
                    event.target === this.deleteBtn ||
                    this.toolbar.contains(event.target)
                )
            );
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
        static lastSelectedType = 'note';

        static isAvailable(schema) {
            return !!(
                schema.nodes.admnote &&
                schema.nodes.admnote_title &&
                schema.nodes.admnote_content &&
                schema.nodes.paragraph
            );
        }

        static createAdmnoteNode(schema, type = 'note', collapse = 'open') {
            const titleNode = schema.nodes.admnote_title.create(
                null,
                schema.text(labelForType(type))
            );
            const paragraphNode = schema.nodes.paragraph.createAndFill();
            const contentNode = schema.nodes.admnote_content.create(
                null,
                paragraphNode ? [paragraphNode] : undefined
            );
            return schema.nodes.admnote.create(
                {type: normalizeType(type), collapse: normalizeCollapse(collapse)},
                [titleNode, contentNode]
            );
        }

        static insertAdmnoteNode(view, schema, type, collapse = 'open') {
            if (!view || !view.state) return false;
            const node = this.createAdmnoteNode(schema, type, collapse);
            if (!node) return false;

            const state = view.state;
            const {$from} = state.selection;
            const index = $from.index();

            if ($from.parent.canReplaceWith(index, index, schema.nodes.admnote)) {
                view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
                view.focus();
                return true;
            }

            for (let depth = $from.depth; depth > 0; depth -= 1) {
                const insertPos = $from.after(depth);
                try {
                    view.dispatch(state.tr.insert(insertPos, node).scrollIntoView());
                    view.focus();
                    return true;
                } catch (e) {
                    // try a higher ancestor
                }
            }

            return false;
        }

        static getMenuItem(schema) {
            if (!this.isAvailable(schema)) return hiddenMenuItem();
            return new MenuItem({
                label: 'Admnote',
                icon: getPencilMenuIcon(),
                render: () => {
                    const item = document.createElement('span');
                    item.className = 'menuitem dropdown admnote-direct-item';
                    const triggerIcon = getPencilMenuIcon();
                    item.appendChild(triggerIcon);

                    const indicator = document.createElement('span');
                    indicator.className = 'dropdown-indicator';
                    const indicatorInner = document.createElement('span');
                    indicatorInner.appendChild(getChevronMenuIcon());
                    indicator.appendChild(indicatorInner);
                    item.appendChild(indicator);

                    const typeMenu = document.createElement('div');
                    typeMenu.className = 'dropdown_content admnote-menu-type-list';
                    typeMenu.style.display = 'none';

                    const updateButtonTitle = () => {
                        const current = normalizeType(this.lastSelectedType || 'note');
                        item.setAttribute('title', 'Type: ' + labelForType(current));
                    };

                    ADMNOTE_TYPES.forEach((type) => {
                        const entry = document.createElement('span');
                        entry.className = 'menuitem admnote-menu-type-option';
                        entry.setAttribute('data-admnote-type', type);
                        entry.style.cursor = 'pointer';

                        const entryIcon = document.createElement('span');
                        entryIcon.className = 'menuicon';
                        entryIcon.appendChild(createTypeIconElement(type, 16));
                        entry.appendChild(entryIcon);

                        const entryLabel = document.createElement('span');
                        entryLabel.className = 'menulabel';
                        entryLabel.textContent = labelForType(type);
                        entry.appendChild(entryLabel);

                        entry.addEventListener('mousedown', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        });
                        entry.addEventListener('click', (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const selectedType = normalizeType(type);
                            this.lastSelectedType = selectedType;
                            updateButtonTitle();
                            typeMenu.style.display = 'none';

                            const view = window.Prosemirror && window.Prosemirror.view;
                            if (!view) return;
                            this.insertAdmnoteNode(view, schema, selectedType);
                        });
                        typeMenu.appendChild(entry);
                    });

                    updateButtonTitle();

                    const toggleMenu = (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        typeMenu.style.display = typeMenu.style.display === 'none' ? 'block' : 'none';
                    };

                    const swallowMenuEvent = (event) => {
                        event.stopPropagation();
                    };

                    item.addEventListener('mousedown', toggleMenu);
                    triggerIcon.addEventListener('mousedown', toggleMenu);
                    indicator.addEventListener('mousedown', toggleMenu);
                    typeMenu.addEventListener('mousedown', swallowMenuEvent);
                    typeMenu.addEventListener('click', swallowMenuEvent);

                    document.addEventListener('click', (event) => {
                        if (!item.contains(event.target)) {
                            typeMenu.style.display = 'none';
                        }
                    });

                    item.appendChild(typeMenu);
                    return item;
                },
                command: () => {
                    // Insertion is handled explicitly by selecting a type in the dropdown.
                    return true;
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
