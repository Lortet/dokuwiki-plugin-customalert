<?php

namespace dokuwiki\plugin\admnote\parser;

use dokuwiki\plugin\prosemirror\parser\Node;

class AdmNodeContent extends Node {
    protected $subnodes = [];
    protected $parent;
    protected $attrs;

    public function __construct($data, Node $parent)
    {
        $this->parent = &$parent;
        $this->attrs = $data['attrs'] ?? [];

        $previousNode = null;
        foreach (($data['content'] ?? []) as $nodeData) {
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
    }

    public function toSyntax()
    {
        $subnodes = [];
        foreach ($this->subnodes as $subnode) {
            $subnodes[] = $subnode->toSyntax();
        }
        // Keep block separation stable across editor round-trips.
        // A single "\n" merges paragraphs into one block in DokuWiki syntax.
        return implode("\n\n", $subnodes);
    }
}
