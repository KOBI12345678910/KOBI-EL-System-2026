import React from 'react';
import DOMPurify from 'isomorphic-dompurify';

interface Props { content: string; className?: string; }

export function SafeSignatureDisplay({ content, className }: Props) {
 const clean = DOMPurify.sanitize(content, {
 ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'br', 'p', 'span', 'div'],
 ALLOWED_ATTR: ['style', 'class'],
 FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
 FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
 });
 return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
