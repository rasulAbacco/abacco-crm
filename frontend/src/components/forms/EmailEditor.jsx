// Email content editor: visual (contentEditable) or HTML source, merge fields,
// links, images and buttons, plus a sandboxed live preview. The server
// sanitises HTML again on save — this editor is a convenience, not a security boundary.
import { useEffect, useRef, useState } from 'react';
import { FiBold, FiItalic, FiUnderline, FiLink, FiImage, FiList, FiCode, FiEye, FiEdit3, FiSquare, FiAlignCenter } from 'react-icons/fi';

const FIELDS = [['firstName', 'First name'], ['lastName', 'Last name'], ['fullName', 'Full name'], ['company', 'Company'], ['email', 'Email'], ['designation', 'Designation'], ['city', 'City'], ['senderName', 'Sender name']];
const SAMPLE = { firstName: 'Priya', lastName: 'Sharma', fullName: 'Priya Sharma', company: 'Example Pvt Ltd', email: 'priya@example.com', designation: 'Head of Sales', city: 'Mumbai', senderName: 'Abacco', unsubscribeUrl: '#' };

export const renderSample = (html) => (html ?? '').replace(/\{\{\s*([a-zA-Z]+)\s*(?:\|\s*([^}]*))?\}\}/g, (_, k, fb) => SAMPLE[k] ?? fb ?? '');

export default function EmailEditor({ value, onChange, height = 380 }) {
  const [mode, setMode] = useState('visual');
  const ref = useRef(null);
  useEffect(() => {
    if (mode === 'visual' && ref.current && ref.current.innerHTML !== (value ?? '')) ref.current.innerHTML = value ?? '';
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === 'visual' && ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== (value ?? '')) ref.current.innerHTML = value ?? '';
  }, [value, mode]);
  const sync = () => onChange(ref.current.innerHTML);
  const cmd = (c, arg) => {
    ref.current.focus();
    document.execCommand(c, false, arg);
    sync();
  };
  const insertHtml = (html) => {
    if (mode === 'html') return onChange(`${value ?? ''}${html}`);
    cmd('insertHTML', html);
    return null;
  };
  const link = () => { const url = window.prompt('Link URL (https://…)'); if (url && /^(https?:|mailto:)/.test(url)) cmd('createLink', url); };
  const image = () => { const url = window.prompt('Image URL (https://…) — host images publicly; attachments are not used'); if (url && /^https:/.test(url)) insertHtml(`<img src="${url}" alt="" style="max-width:100%;height:auto;border:0" />`); };
  const button = () => {
    const url = window.prompt('Button link (https://…)');
    if (!url || !/^https?:/.test(url)) return;
    const text = window.prompt('Button text', 'Learn more') || 'Learn more';
    insertHtml(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:#1d4ed8;border-radius:6px"><a href="${url}" style="display:inline-block;padding:10px 20px;color:#ffffff;text-decoration:none;font-weight:600;font-family:Arial,sans-serif">${text.replace(/</g, '&lt;')}</a></td></tr></table>`);
  };
  const Btn = ({ onClick, label, children }) => <button type="button" className="rounded p-1.5 text-ink-700 hover:bg-ink-100" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={label} aria-label={label}>{children}</button>;

  return (
    <div className="overflow-hidden rounded-lg border border-ink-300">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-ink-50 px-1.5 py-1">
        {mode === 'visual' && <>
          <Btn label="Bold" onClick={() => cmd('bold')}><FiBold /></Btn><Btn label="Italic" onClick={() => cmd('italic')}><FiItalic /></Btn><Btn label="Underline" onClick={() => cmd('underline')}><FiUnderline /></Btn>
          <Btn label="Bulleted list" onClick={() => cmd('insertUnorderedList')}><FiList /></Btn><Btn label="Centre" onClick={() => cmd('justifyCenter')}><FiAlignCenter /></Btn>
          <select className="rounded border-0 bg-transparent py-1 text-xs" onChange={(e) => { if (e.target.value) cmd('formatBlock', e.target.value); e.target.value = ''; }} aria-label="Text style" defaultValue=""><option value="">Style</option><option value="P">Paragraph</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option></select>
          <Btn label="Link" onClick={link}><FiLink /></Btn>
        </>}
        <Btn label="Image" onClick={image}><FiImage /></Btn><Btn label="Button" onClick={button}><FiSquare /></Btn>
        <select className="ml-1 rounded border border-ink-200 bg-white py-1 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) insertHtml(`{{${e.target.value}}}`); e.target.value = ''; }} aria-label="Insert personalisation"><option value="">+ Personalise</option>{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <div className="ml-auto flex gap-0.5">
          <Btn label="Visual editor" onClick={() => setMode('visual')}><FiEdit3 /></Btn><Btn label="HTML source" onClick={() => setMode('html')}><FiCode /></Btn><Btn label="Preview" onClick={() => setMode('preview')}><FiEye /></Btn>
        </div>
      </div>
      {mode === 'visual' && <div ref={ref} contentEditable suppressContentEditableWarning className="prose-sm overflow-y-auto bg-white p-4 text-sm focus:outline-none [&_a]:text-brand-700 [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5" style={{ height }} onInput={sync} onBlur={sync} />}
      {mode === 'html' && <textarea className="block w-full border-0 bg-ink-900 p-3 font-mono text-xs text-ink-100 focus:outline-none" style={{ height }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} spellCheck={false} />}
      {mode === 'preview' && <iframe title="Email preview" sandbox="" className="block w-full bg-white" style={{ height }} srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:16px;font-family:Arial,sans-serif;font-size:14px">${renderSample(value)}<hr style="margin-top:24px;border:0;border-top:1px solid #e5e7eb"><p style="font-size:11px;color:#6b7280;text-align:center">Your legal name, postal address and an unsubscribe link are added automatically.</p></body></html>`} />}
      <p className="border-t border-ink-200 bg-ink-50 px-3 py-1.5 text-[11px] text-ink-500">Use {'{{firstName|there}}'} to set a fallback when a value is missing.</p>
    </div>
  );
}
