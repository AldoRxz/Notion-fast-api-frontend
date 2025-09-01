import React, { useMemo, useState, useRef } from 'react';
import { createEditor, Editor, Transforms, Range, Element as SlateElement } from 'slate';
import type { Descendant, BaseEditor } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { Box, IconButton, Tooltip, Divider, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import CodeIcon from '@mui/icons-material/Code';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import ListIcon from '@mui/icons-material/FormatListBulleted';
import NumbersIcon from '@mui/icons-material/FormatListNumbered';
import QuoteIcon from '@mui/icons-material/FormatQuote';
import AddIcon from '@mui/icons-material/Add';
import ImageIcon from '@mui/icons-material/Image';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: { type: string; url?: string; children: CustomText[] };
    Text: CustomText;
  }
}
interface CustomText { text: string; bold?: boolean; italic?: boolean; code?: boolean }

interface RichEditorProps { value: any; onChange: (v: any) => void }

const DEFAULT_INITIAL: Descendant[] = [{ type: 'paragraph', children: [{ text: '' }] }];
const HOTKEYS: Record<string, string> = { 'mod+b': 'bold', 'mod+i': 'italic', 'mod+`': 'code' };
const LIST_TYPES = ['numbered-list','bulleted-list'];

function isMarkActive(editor: Editor, format: string) { const marks: any = Editor.marks(editor); return marks ? marks[format] === true : false; }
function toggleMark(editor: Editor, format: string) { const isActive = isMarkActive(editor, format); if (isActive) Editor.removeMark(editor, format); else Editor.addMark(editor, format, true); }
function isBlockActive(editor: Editor, format: string) { const [match] = Array.from(Editor.nodes(editor, { match: n=> SlateElement.isElement(n) && (n as any).type === format })); return !!match; }
function toggleBlock(editor: Editor, format: string) {
  const isActive = isBlockActive(editor, format);
  const isList = LIST_TYPES.includes(format);
  Transforms.unwrapNodes(editor, { match: n=> SlateElement.isElement(n) && LIST_TYPES.includes((n as any).type), split: true });
  const newType = isActive ? 'paragraph' : isList ? 'list-item' : format;
  Transforms.setNodes(editor, { type: newType } as any);
  if (!isActive && isList) {
    const block: any = { type: format, children: [] };
    Transforms.wrapNodes(editor, block);
  }
}

function withShortcuts(editor: Editor) {
  const { insertText } = editor;
  editor.insertText = (text: string) => {
    const { selection } = editor;
    if (text === ' ' && selection && Range.isCollapsed(selection)) {
      const [start] = Range.edges(selection);
      const blockRange = Editor.range(editor, Editor.start(editor, start.path.slice(0,1)), start);
      const beforeText = Editor.string(editor, blockRange);
      const shortcuts: Record<string,string> = { '#':'heading-one','##':'heading-two','-':'bulleted-list','*':'bulleted-list','1.':'numbered-list','>':'block-quote','```':'code-block' };
      if (shortcuts[beforeText]) {
        Transforms.select(editor, blockRange); Transforms.delete(editor);
        if (['bulleted-list','numbered-list'].includes(shortcuts[beforeText])) { Transforms.setNodes(editor,{ type:'list-item'} as any); Transforms.wrapNodes(editor,{ type:shortcuts[beforeText], children:[]} as any); }
        else { Transforms.setNodes(editor,{ type:shortcuts[beforeText]} as any); }
      }
    }
    insertText(text);
  };
  return editor;
}

function insertParagraphBelow(editor: Editor, path: any) {
  const newBlock: any = { type: 'paragraph', children: [{ text: '' }] };
  const insertPath = [...path]; insertPath[insertPath.length-1] = insertPath[insertPath.length-1] + 1;
  Transforms.insertNodes(editor, newBlock, { at: insertPath });
  Transforms.select(editor, Editor.start(editor, insertPath));
}

function insertDividerBelow(editor: Editor, path: any) {
  const newBlock: any = { type: 'divider', children: [{ text: '' }] };
  const insertPath = [...path]; insertPath[insertPath.length-1] = insertPath[insertPath.length-1] + 1;
  Transforms.insertNodes(editor, newBlock, { at: insertPath });
}

async function insertImageBelow(editor: Editor, path: any, fileOrUrl: File | string) {
  let url: string;
  if (typeof fileOrUrl === 'string') url = fileOrUrl; else url = await new Promise<string>((res, rej)=> { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(fileOrUrl); });
  const node: any = { type: 'image', url, children: [{ text: '' }] };
  const insertPath = [...path]; insertPath[insertPath.length-1] = insertPath[insertPath.length-1] + 1;
  Transforms.insertNodes(editor, node, { at: insertPath });
}

const BlockActions = ({ editor, element }: { editor: Editor; element: any }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const path = ReactEditor.findPath(editor as any, element);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const move = (dir: number) => {
    const newPath = [...path]; newPath[newPath.length-1] = newPath[newPath.length-1] + dir; if (newPath[newPath.length-1] < 0) return; Transforms.moveNodes(editor, { at: path, to: newPath }); };
  const handleAdd = (cb: ()=>void) => { cb(); setAnchorEl(null); };
  return (
    <Box contentEditable={false} sx={{ position:'absolute', left:-40, top:0, display:'flex', flexDirection:'column', gap:.5, opacity:.5, '&:hover':{ opacity:1 } }}>
      <IconButton size="small" onClick={e=> setAnchorEl(e.currentTarget)}><AddIcon fontSize="inherit" /></IconButton>
      <IconButton size="small" onClick={()=> move(-1)}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
      <IconButton size="small" onClick={()=> move(1)}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={()=> setAnchorEl(null)}>
        <MenuItem onClick={()=> handleAdd(()=> insertParagraphBelow(editor, path))}><ListItemIcon><AddIcon fontSize="small" /></ListItemIcon><ListItemText primary="Parrafo" /></MenuItem>
        <MenuItem onClick={()=> handleAdd(()=> { toggleBlock(editor,'heading-one'); })}><ListItemIcon><LooksOneIcon fontSize="small" /></ListItemIcon><ListItemText primary="Heading 1" /></MenuItem>
        <MenuItem onClick={()=> handleAdd(()=> { toggleBlock(editor,'heading-two'); })}><ListItemIcon><LooksTwoIcon fontSize="small" /></ListItemIcon><ListItemText primary="Heading 2" /></MenuItem>
        <MenuItem onClick={()=> handleAdd(()=> insertDividerBelow(editor, path))}><ListItemIcon><HorizontalRuleIcon fontSize="small" /></ListItemIcon><ListItemText primary="Divider" /></MenuItem>
        <MenuItem onClick={()=> { fileInputRef.current?.click(); }}><ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon><ListItemText primary="Imagen" /></MenuItem>
        <MenuItem onClick={()=> handleAdd(()=> insertImageBelow(editor, path, prompt('URL imagen') || ''))}><ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon><ListItemText primary="Imagen URL" /></MenuItem>
      </Menu>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=> { const f=e.target.files?.[0]; if (f) { insertImageBelow(editor, path, f); } setAnchorEl(null); e.target.value=''; }} />
    </Box>
  );
};

const Element = ({ attributes, children, element, editor }: any) => {
  const wrapperStyle: React.CSSProperties = { position:'relative', paddingLeft: element.type !== 'list-item' ? 0 : undefined };
  switch (element.type) {
    case 'heading-one': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><h1 {...attributes} style={{ fontSize:'1.9rem', margin:'1.2rem 0 .6rem' }}>{children}</h1></div>;
    case 'heading-two': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><h2 {...attributes} style={{ fontSize:'1.5rem', margin:'1rem 0 .5rem' }}>{children}</h2></div>;
    case 'bulleted-list': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><ul {...attributes} style={{ marginLeft:20 }}>{children}</ul></div>;
    case 'numbered-list': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><ol {...attributes} style={{ marginLeft:20 }}>{children}</ol></div>;
    case 'list-item': return <li {...attributes}>{children}</li>;
    case 'block-quote': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><blockquote {...attributes} style={{ borderLeft:'3px solid #888', margin:'8px 0', padding:'4px 12px', opacity:.9 }}>{children}</blockquote></div>;
    case 'code-block': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><pre {...attributes} style={{ background:'#1e1e1e', color:'#dcdcdc', padding:12, borderRadius:6, overflowX:'auto' }}><code>{children}</code></pre></div>;
    case 'divider': return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><hr {...attributes} style={{ border:'none', borderTop:'1px solid #444', margin:'16px 0' }} /></div>;
    case 'image': return <div style={{ position:'relative', margin:'12px 0' }}><BlockActions editor={editor} element={element} /><img {...attributes} src={element.url} style={{ maxWidth:'100%', borderRadius:8, display:'block' }} />{children}</div>;
    default: return <div style={wrapperStyle}><BlockActions editor={editor} element={element} /><p {...attributes} style={{ margin:'4px 0' }}>{children}</p></div>;
  }
};

const Leaf = ({ attributes, children, leaf }: any) => { if (leaf.bold) children = <strong>{children}</strong>; if (leaf.italic) children = <em>{children}</em>; if (leaf.code) children = <code style={{ background:'#2a2f3a', padding:'2px 4px', borderRadius:4 }}>{children}</code>; return <span {...attributes}>{children}</span>; };

export default function RichEditor({ value, onChange }: RichEditorProps) {
  const initial = useMemo<Descendant[]>(() => (Array.isArray(value) && value.length ? value : DEFAULT_INITIAL), [value]);
  const editor = useMemo(() => withShortcuts(withReact(createEditor() as ReactEditor)), []);
  const [internal, setInternal] = useState<Descendant[]>(initial);
  const handleChange = (val: Descendant[]) => { setInternal(val); onChange(val); };
  const handleKeyDown = (event: React.KeyboardEvent) => { for (const hotkey in HOTKEYS) { const [mod, key] = hotkey.split('+'); if ((mod==='mod' && (event.metaKey||event.ctrlKey)) && event.key===key) { event.preventDefault(); toggleMark(editor, HOTKEYS[hotkey]); } } };
  const ToolBtn = ({ format, icon, onClick }: any) => (<Tooltip title={format}><IconButton size="small" onMouseDown={e=> { e.preventDefault(); onClick(); }} color={isMarkActive(editor, format) || isBlockActive(editor, format) ? 'primary':'default'}>{icon}</IconButton></Tooltip>);
  return (
    <Box>
      <Box sx={{ display:'flex', gap:.5, flexWrap:'wrap', mb:1 }}>
        <ToolBtn format="bold" icon={<FormatBoldIcon fontSize="small" />} onClick={()=> toggleMark(editor,'bold')} />
        <ToolBtn format="italic" icon={<FormatItalicIcon fontSize="small" />} onClick={()=> toggleMark(editor,'italic')} />
        <ToolBtn format="code" icon={<CodeIcon fontSize="small" />} onClick={()=> toggleMark(editor,'code')} />
        <Divider flexItem orientation="vertical" />
        <ToolBtn format="heading-one" icon={<LooksOneIcon fontSize="small" />} onClick={()=> toggleBlock(editor,'heading-one')} />
        <ToolBtn format="heading-two" icon={<LooksTwoIcon fontSize="small" />} onClick={()=> toggleBlock(editor,'heading-two')} />
        <ToolBtn format="bulleted-list" icon={<ListIcon fontSize="small" />} onClick={()=> toggleBlock(editor,'bulleted-list')} />
        <ToolBtn format="numbered-list" icon={<NumbersIcon fontSize="small" />} onClick={()=> toggleBlock(editor,'numbered-list')} />
        <ToolBtn format="block-quote" icon={<QuoteIcon fontSize="small" />} onClick={()=> toggleBlock(editor,'block-quote')} />
        <ToolBtn format="code-block" icon={<CodeIcon fontSize="small" />} onClick={()=> toggleBlock(editor,'code-block')} />
      </Box>
      <Slate editor={editor} initialValue={internal} onChange={handleChange}>
        <Editable renderElement={(p)=> <Element {...p} editor={editor} />} renderLeaf={(p)=> <Leaf {...p} />} onKeyDown={handleKeyDown} spellCheck autoFocus style={{ minHeight:300, outline:'none' }} />
      </Slate>
    </Box>
  );
}
