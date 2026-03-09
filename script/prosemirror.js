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
            // Keep it restricted to regular block nodes (paragraphs, lists, tables, ...)
            // without exposing admnote_content itself as a generic block type.
            content: 'block*',
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
            this.dom.appendChild(this.toolbar);

            this.admDom = document.createElement('div');
            this.admDom.className = 'admonition ' + (node.attrs.type || 'note');
            this.dom.appendChild(this.admDom);

            // Keep admnote children as direct descendants of .admonition
            // so rules like ".admonition.failure > .admonition-title" work.
            this.contentDOM = this.admDom;
        }

        updateType(newType) {
            const pos = this.getPos();
            const attrs = {...this.node.attrs, type: normalizeType(newType)};
            this.outerView.dispatch(this.outerView.state.tr.setNodeMarkup(pos, null, attrs, this.node.marks));
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
            return !!(event && (event.target === this.select || this.toolbar.contains(event.target)));
        }

        ignoreMutation() {
            return false;
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

    window.Prosemirror.pluginNodeViews.admnote = function admnote(node, outerView, getPos) {
        return new AdmnoteNodeView(node, outerView, getPos);
    };

    window.Prosemirror.pluginMenuItemDispatchers.push(AdmnoteMenuItemDispatcher);
    }

    jQuery(document).on('PROSEMIRROR_API_INITIALIZED', initializeAdmnoteProsemirror);
    initializeAdmnoteProsemirror();
})();
