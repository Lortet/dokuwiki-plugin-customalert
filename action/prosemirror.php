<?php

use dokuwiki\plugin\prosemirror\schema\Node;
use dokuwiki\plugin\prosemirror\schema\NodeStack;
use dokuwiki\plugin\admnote\parser\AdmNode;
use dokuwiki\plugin\admnote\parser\AdmNodeTitle;
use dokuwiki\plugin\admnote\parser\AdmNodeContent;

class action_plugin_admnote_prosemirror extends \dokuwiki\Extension\ActionPlugin {
    /** @var bool[] stack used to detect empty admnote bodies */
    private $contentSeenStack = [];
    /** @var Node[] stack of current admnote_content nodes */
    private $contentNodeStack = [];
    /** @var string[] stack of raw body chunks for each open admnote */
    private $rawContentStack = [];
    /** @var bool[] stack indicating inline admnote capture mode */
    private $inlineCaptureStack = [];
    /** @var string[] allowed admnote types */
    private $admTypes = ['abstract','bug','danger','example','failure','information','note','question','quote','achievement','tip','warning'];

    public function register(Doku_Event_Handler $controller) {
        $controller->register_hook('PROSEMIRROR_RENDER_PLUGIN', 'BEFORE', $this, 'handleRender');
        $controller->register_hook('PROSEMIRROR_PARSE_UNKNOWN', 'BEFORE', $this, 'parseToSyntax');
    }

    public function handleRender(Doku_Event $event, $param) {

        $data = $event->data;

        if($data['name'] !== 'admnote_renderer') {
            return;
        }

        $event->preventDefault();
        $event->stopPropagation();

        $dataContent = $data['data'][1];

        if($data['state'] === 1) {
            $type = 'note';
            $title = '';
            $collapse = 'open';

            if (is_array($dataContent)) {
                $type = strtolower((string)($dataContent['class'] ?? 'note'));
                $title = (string)($dataContent['heading'] ?? '');
                $collapse = strtolower((string)($dataContent['collapse'] ?? 'open'));
            } else {
                $tag_parts = explode('#', (string)$dataContent, 2);
                $type = strtolower((string)($tag_parts[0] ?? 'note'));
                $title = (string)($tag_parts[1] ?? '');
            }

            if (!in_array($type, $this->admTypes, true)) {
                $type = 'note';
            }
            if ($collapse !== 'open' && $collapse !== 'close') {
                $collapse = 'open';
            }

            $node = new Node('admnote');
            $node->attr('type', $type);
            $node->attr('collapse', $collapse);

            $data['renderer']->nodestack->addTop($node);

            $titleNode = new Node('admnote_title');
            $titleTextNode = new Node('text');
            $titleTextNode->setText($title);
            $titleNode->addChild($titleTextNode);
            $data['renderer']->nodestack->add($titleNode);

            $contentNode = new Node('admnote_content');
            $data['renderer']->nodestack->addTop($contentNode);
            $this->contentSeenStack[] = false;
            $this->contentNodeStack[] = $contentNode;
            $this->rawContentStack[] = '';
            $this->inlineCaptureStack[] = false;
        }
        
        if($data['state'] === 2 || $data['state'] === 3) {
            $top = count($this->rawContentStack) - 1;
            if ($top >= 0) {
                $chunk = (string)$dataContent;
                $capture = (bool)($this->inlineCaptureStack[$top] ?? false);

                // Keep default text rendering unless we detect an inline nested admnote.
                // This preserves linebreak handling (\\ -> hard_break) in normal content.
                if (!$capture && stripos($chunk, '<adm') !== false) {
                    $capture = true;
                    $this->inlineCaptureStack[$top] = true;
                }

                if ($capture) {
                    $this->rawContentStack[$top] .= $chunk;
                } else {
                    // admnote_content only accepts block children in schema,
                    // so raw text must be wrapped as paragraph (not bare text nodes).
                    if ($this->addRawTextNode($data['renderer'], $chunk)) {
                        $this->contentSeenStack[$top] = true;
                    }
                }
            }
        }

        if($data['state'] === 4) {
            $top = count($this->contentSeenStack) - 1;
            $hasContent = $top >= 0 ? (bool)$this->contentSeenStack[$top] : false;
            if ($top >= 0) array_pop($this->contentSeenStack);

            $raw = '';
            $rawTop = count($this->rawContentStack) - 1;
            if ($rawTop >= 0) {
                $raw = (string)$this->rawContentStack[$rawTop];
                array_pop($this->rawContentStack);
            }
            $capture = false;
            $captureTop = count($this->inlineCaptureStack) - 1;
            if ($captureTop >= 0) {
                $capture = (bool)$this->inlineCaptureStack[$captureTop];
                array_pop($this->inlineCaptureStack);
            }

            $contentNode = array_pop($this->contentNodeStack);
            if ($contentNode instanceof Node && $contentNode->hasContent()) {
                $hasContent = true;
            }

            if ($capture && $raw !== '') {
                $added = $this->addParsedInlineAdmnotes($data['renderer'], $raw);
                if ($added) $hasContent = true;
            }

            if (!$hasContent) {
                $this->addEmptyContentParagraph($data['renderer']);
            }

            $data['renderer']->nodestack->drop('admnote_content');
            $data['renderer']->nodestack->drop('admnote');
        }

        return;
    }

    /**
     * Add an empty paragraph inside admnote_content when source is empty.
     *
     * @param renderer_plugin_prosemirror $renderer
     * @return void
     */
    protected function addEmptyContentParagraph($renderer) {
        $paragraphNode = new Node('paragraph');
        $renderer->nodestack->add($paragraphNode);
    }

    /**
     * Split raw text and reconstruct inline "<adm ...>...</adm>" as real admnote nodes.
     * This handles cases where nested admnotes are not tokenized by the lexer.
     *
     * @param renderer_plugin_prosemirror $renderer
     * @param string $raw
     * @return bool true when something meaningful was added
     */
    protected function addParsedInlineAdmnotes($renderer, string $raw): bool {
        if ($raw === '') return false;

        // Fast path: plain text without inline admnote syntax.
        if (stripos($raw, '<adm') === false || stripos($raw, '</adm>') === false) {
            return $this->addRawTextNode($renderer, $raw);
        }

        $added = false;
        $offset = 0;
        $len = strlen($raw);

        while ($offset < $len) {
            $openPos = stripos($raw, '<adm', $offset);
            if ($openPos === false) {
                $tail = substr($raw, $offset);
                if ($this->addRawTextNode($renderer, $tail)) $added = true;
                break;
            }

            $before = substr($raw, $offset, $openPos - $offset);
            if ($this->addRawTextNode($renderer, $before)) $added = true;

            $parsed = $this->extractAdmBlock($raw, $openPos);
            if (!$parsed) {
                // Unbalanced or malformed tag sequence: keep source as plain text.
                $tail = substr($raw, $openPos);
                if ($this->addRawTextNode($renderer, $tail)) $added = true;
                break;
            }

            $this->addInlineAdmnoteNode($renderer, $parsed['header'], $parsed['body']);
            $added = true;
            $offset = $openPos + $parsed['length'];
        }

        return $added;
    }

    /**
     * Extract one balanced <adm ...>...</adm> block starting at $start.
     * Supports nested admnote blocks.
     *
     * @param string $raw
     * @param int $start
     * @return array{header:string,body:string,length:int}|null
     */
    protected function extractAdmBlock(string $raw, int $start): ?array {
        $len = strlen($raw);
        if ($start < 0 || $start >= $len) return null;

        if (!preg_match('/\G<adm\s*([^>]*)>/is', $raw, $m, 0, $start)) {
            return null;
        }

        $header = (string)$m[1];
        $openLen = strlen((string)$m[0]);
        $cursor = $start + $openLen;
        $bodyStart = $cursor;
        $depth = 1;
        $closeStart = null;

        while ($cursor < $len) {
            $nextOpen = stripos($raw, '<adm', $cursor);
            $nextClose = stripos($raw, '</adm', $cursor);
            if ($nextClose === false) return null;

            if ($nextOpen !== false && $nextOpen < $nextClose) {
                if (preg_match('/\G<adm\s*[^>]*>/is', $raw, $om, 0, $nextOpen)) {
                    $depth++;
                    $cursor = $nextOpen + strlen((string)$om[0]);
                    continue;
                }
                $cursor = $nextOpen + 4;
                continue;
            }

            if (preg_match('/\G<\/adm\s*>/is', $raw, $cm, 0, $nextClose)) {
                $depth--;
                if ($depth === 0) {
                    $closeStart = $nextClose;
                    $blockEnd = $nextClose + strlen((string)$cm[0]);
                    return [
                        'header' => $header,
                        'body' => substr($raw, $bodyStart, $closeStart - $bodyStart),
                        'length' => $blockEnd - $start,
                    ];
                }
                $cursor = $nextClose + strlen((string)$cm[0]);
                continue;
            }

            $cursor = $nextClose + 6;
        }

        return null;
    }

    /**
     * @param renderer_plugin_prosemirror $renderer
     * @param string $text
     * @return bool
     */
    protected function addRawTextNode($renderer, string $text): bool {
        if (trim($text) === '') return false;

        $current = $renderer->nodestack->current();
        if ($current && $current->getType() === 'admnote_content') {
            $paragraphNode = new Node('paragraph');
            $textNode = new Node('text');
            $textNode->setText($text);
            $paragraphNode->addChild($textNode);
            $renderer->nodestack->add($paragraphNode);
            return true;
        }

        $textNode = new Node('text');
        $textNode->setText($text);
        $renderer->nodestack->add($textNode);
        return true;
    }

    /**
     * Build an admnote node from inline syntax pieces.
     *
     * @param renderer_plugin_prosemirror $renderer
     * @param string $header
     * @param string $body
     * @return void
     */
    protected function addInlineAdmnoteNode($renderer, string $header, string $body): void {
        $parts = preg_split('/\s+/', trim($header), 2);
        $type = isset($parts[0]) ? strtolower(trim($parts[0])) : '';
        if (!in_array($type, $this->admTypes, true)) {
            $type = 'note';
        }

        $collapse = 'open';
        $title = isset($parts[1]) ? trim($parts[1]) : '';
        if ($title !== '') {
            $titleParts = preg_split('/\s+/', $title, 2);
            $toggleWord = strtolower((string)($titleParts[0] ?? ''));
            if ($toggleWord === 'open' || $toggleWord === 'close') {
                $collapse = $toggleWord;
                $title = isset($titleParts[1]) ? trim((string)$titleParts[1]) : '';
            }
        }
        if ($title === '') {
            $title = (string)$this->getLang('adm_' . $type);
            if ($title === '') $title = ucfirst($type);
        }

        $node = new Node('admnote');
        $node->attr('type', $type);
        $node->attr('collapse', $collapse);
        $renderer->nodestack->addTop($node);

        $titleNode = new Node('admnote_title');
        $titleTextNode = new Node('text');
        $titleTextNode->setText($title);
        $titleNode->addChild($titleTextNode);
        $renderer->nodestack->add($titleNode);

        $contentNode = new Node('admnote_content');
        $renderer->nodestack->addTop($contentNode);
        $added = $this->addParsedInlineAdmnotes($renderer, (string)$body);
        if (!$added) {
            $this->addEmptyContentParagraph($renderer);
        }

        $renderer->nodestack->drop('admnote_content');
        $renderer->nodestack->drop('admnote');
    }

    /**
     * Event handler for PROSEMIRROR_PARSE_UNKNOWN
     * Translate the JSON from Prosemirror back to DokuWiki's syntax
     *
     * @param Doku_Event $event
     * @return void
     */
    public function parseToSyntax(Doku_Event $event) {
        if (
            $event->data['node']['type'] !== 'admnote'
            && $event->data['node']['type'] !== 'admnote_title'
            && $event->data['node']['type'] !== 'admnote_content') {
            return;
        }

        if ( $event->data['node']['type'] === 'admnote_title') {
            $event->data['newNode'] = new AdmNodeTitle($event->data['node'], $event->data['parent']);
        }
        else if ( $event->data['node']['type'] === 'admnote_content') {
            $event->data['newNode'] = new AdmNodeContent($event->data['node'], $event->data['parent']);
        }
        else {
            $event->data['newNode'] = new AdmNode($event->data['node'], $event->data['parent']);
        }

        $event->preventDefault();
        $event->stopPropagation();
    }
}
