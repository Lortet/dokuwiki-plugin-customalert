<?php

namespace dokuwiki\plugin\admnote\parser;

use dokuwiki\plugin\prosemirror\parser\Node;

class AdmNode extends Node {
    protected $subnodes = [];
    protected $parent;
    protected $attrs;
    protected $data;

    public function __construct($data, Node $parent) {
        $this->parent = &$parent;

        $previousNode = null;
        foreach ($data['content'] as $nodeData) {
            try {
                $newNode = self::getSubNode($nodeData, $this, $previousNode);
            }
            catch (\Throwable $e) {
                error_log("************ Unknown Node type: " . $nodeData['type'] . " ************");
                throw $e;
            }
            $this->subnodes[] = $newNode;
            $previousNode = $newNode;
        }

        $this->attrs = $data['attrs'];
    }

    public function toSyntax() {
        $subnodes = [];
        foreach ($this->subnodes as $subnode) {
            if($subnode instanceof AdmNodeTitle) {
                $this->attrs['title'] = $subnode->toSyntax();
            }
            else {
                $subnodes[] = $subnode->toSyntax();
            }
        }
        $body = implode("\n", $subnodes);

        // Keep opening/closing tags on dedicated lines to avoid list/table parsing issues.
        if ($body !== '' && substr($body, -1) !== "\n") {
            $body .= "\n";
        }

        return "<adm " . $this->attrs['type'] . " " . $this->attrs['title'] . ">\n" . $body . "</adm>";
    }
}
