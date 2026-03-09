<?php

namespace dokuwiki\plugin\admnote\parser;

use dokuwiki\plugin\prosemirror\parser\Node;

class AdmNodeTitle extends Node {
    protected $data;

    public function __construct($data, Node $parent) {
        $this->data = $data;
    }

    public function toSyntax() {
        return $this->data['content'][0]['text'];
    }
}
