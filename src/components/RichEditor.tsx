import React, { useMemo, useState, useRef } from "react";
import {
	createEditor,
	Editor,
	Transforms,
	Range,
	Point,
	Element as SlateElement,
} from "slate";
import type { Descendant, BaseEditor } from "slate";
import {
	Slate,
	Editable,
	withReact,
	ReactEditor,
	useSelected,
	useFocused,
} from "slate-react";
import {
	Box,
	IconButton,
	Tooltip,
	Divider,
	Menu,
	MenuItem,
	ListItemIcon,
	ListItemText,
} from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import CodeIcon from "@mui/icons-material/Code";
import LooksOneIcon from "@mui/icons-material/LooksOne";
import LooksTwoIcon from "@mui/icons-material/LooksTwo";
import ListIcon from "@mui/icons-material/FormatListBulleted";
import NumbersIcon from "@mui/icons-material/FormatListNumbered";
import QuoteIcon from "@mui/icons-material/FormatQuote";
import AddIcon from "@mui/icons-material/Add";
import ImageIcon from "@mui/icons-material/Image";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import DeleteIcon from "@mui/icons-material/Delete";

declare module "slate" {
	interface CustomTypes {
		Editor: BaseEditor & ReactEditor;
		Element: { type: string; url?: string; children: CustomText[] };
		Text: CustomText;
	}
}
interface CustomText {
	text: string;
	bold?: boolean;
	italic?: boolean;
	code?: boolean;
}

type ParagraphElement = { type: "paragraph"; children: CustomText[] };
type HeadingOneElement = { type: "heading-one"; children: CustomText[] };
type HeadingTwoElement = { type: "heading-two"; children: CustomText[] };
type BulletedListElement = { type: "bulleted-list"; children: CustomElement[] };
type NumberedListElement = { type: "numbered-list"; children: CustomElement[] };
type ListItemElement = { type: "list-item"; children: CustomText[] };
type QuoteElement = { type: "block-quote"; children: CustomText[] };
type CodeBlockElement = { type: "code-block"; children: CustomText[] };
type DividerElement = { type: "divider"; children: CustomText[] };
type ImageElement = { type: "image"; url: string; children: CustomText[] };
type CustomElement =
	| ParagraphElement
	| HeadingOneElement
	| HeadingTwoElement
	| BulletedListElement
	| NumberedListElement
	| ListItemElement
	| QuoteElement
	| CodeBlockElement
	| DividerElement
	| ImageElement;

interface RichEditorProps {
	value: Descendant[];
	onChange: (v: Descendant[]) => void;
}

function newInitial(): Descendant[] {
	return [{ type: "paragraph", children: [{ text: "" }] }];
}
const HOTKEYS: Record<string, string> = {
	"mod+b": "bold",
	"mod+i": "italic",
	"mod+`": "code",
};
const LIST_TYPES = ["numbered-list", "bulleted-list"];

function isMarkActive(editor: Editor, format: string) {
	const marks = Editor.marks(editor) as Record<string, unknown> | null;
	return !!marks && marks[format] === true;
}
function toggleMark(editor: Editor, format: string) {
	const isActive = isMarkActive(editor, format);
	if (isActive) Editor.removeMark(editor, format);
	else Editor.addMark(editor, format, true);
}
function isBlockActive(editor: Editor, format: string) {
	const [match] = Array.from(
		Editor.nodes(editor, {
			match: (n) =>
				SlateElement.isElement(n) &&
				(n as SlateElement & { type?: string }).type === format,
		})
	);
	return Boolean(match);
}
function toggleBlock(editor: Editor, format: string) {
	const isActive = isBlockActive(editor, format);
	const isList = LIST_TYPES.includes(format);
	Transforms.unwrapNodes(editor, {
		match: (n) =>
			SlateElement.isElement(n) &&
			LIST_TYPES.includes((n as SlateElement & { type?: string }).type ?? ""),
		split: true,
	});
	let newType: string;
	if (isActive) newType = "paragraph";
	else if (isList) newType = "list-item";
	else newType = format;
	Transforms.setNodes(editor, { type: newType } as Partial<SlateElement>);
	if (!isActive && isList) {
		// Minimal valid list container; actual list-items exist or will be created
		const container = {
			type: format,
			children: [{ text: "" }],
		} as unknown as SlateElement;
		Transforms.wrapNodes(editor, container);
	}
}

function withShortcuts(editor: Editor) {
	const { insertText } = editor;
	editor.insertText = (text: string) => {
		const { selection } = editor;
		if (text === " " && selection && Range.isCollapsed(selection)) {
			const [start] = Range.edges(selection);
			const blockRange = Editor.range(
				editor,
				Editor.start(editor, start.path.slice(0, 1)),
				start
			);
			const beforeText = Editor.string(editor, blockRange);
			const shortcuts: Record<string, string> = {
				"#": "heading-one",
				"##": "heading-two",
				"-": "bulleted-list",
				"*": "bulleted-list",
				"1.": "numbered-list",
				">": "block-quote",
				"```": "code-block",
			};
			if (shortcuts[beforeText]) {
				Transforms.select(editor, blockRange);
				Transforms.delete(editor);
				if (
					["bulleted-list", "numbered-list"].includes(shortcuts[beforeText])
				) {
					Transforms.setNodes(editor, {
						type: "list-item",
					} as Partial<SlateElement>);
					Transforms.wrapNodes(editor, {
						type: shortcuts[beforeText],
						children: [],
					} as SlateElement);
				} else {
					Transforms.setNodes(editor, {
						type: shortcuts[beforeText],
					} as Partial<SlateElement>);
				}
			}
		}
		insertText(text);
	};
	return editor;
}

// Plugin para que un code-block soporte múltiples líneas internas con \n
function withCodeBlock(editor: Editor) {
	const { insertBreak, deleteBackward } = editor;
	editor.insertBreak = () => {
		const [match] = Editor.nodes(editor, {
			match: (n) =>
				SlateElement.isElement(n) &&
				(n as SlateElement & { type?: string }).type === "code-block",
		});
		if (match) {
			Editor.insertText(editor, "\n");
			return;
		}
		// Enter sobre imagen -> crear párrafo debajo
		const [img] = Editor.nodes(editor, {
			match: (n) =>
				SlateElement.isElement(n) &&
				(n as SlateElement & { type?: string }).type === "image",
		});
		if (img) {
			const [, imgPath] = img as unknown as [SlateElement, number[]];
			const newPath = [...imgPath];
			newPath[newPath.length - 1] += 1;
			const para: ParagraphElement = {
				type: "paragraph",
				children: [{ text: "" }],
			};
			Transforms.insertNodes(editor, para, { at: newPath });
			Transforms.select(editor, Editor.start(editor, newPath));
			return;
		}
		insertBreak();
	};
	editor.deleteBackward = (unit) => {
		const { selection } = editor;
		if (selection && Range.isCollapsed(selection)) {
			const [match] = Editor.nodes(editor, {
				match: (n) =>
					SlateElement.isElement(n) &&
					(n as SlateElement & { type?: string }).type === "code-block",
			});
			if (match) {
				const [, path] = match as unknown as [SlateElement, number[]];
				const start = Editor.start(editor, path);
				if (Point.equals(selection.anchor, start)) {
					// salir del code-block si está al inicio
					Transforms.setNodes(editor, {
						type: "paragraph",
					} as Partial<SlateElement>);
					return;
				}
			}
		}
		deleteBackward(unit);
	};
	return editor;
}

function withImages(editor: Editor) {
	const { isVoid } = editor;
	editor.isVoid = (element: SlateElement) =>
		(element as SlateElement & { type?: string }).type === "image"
			? true
			: isVoid(element);
	return editor;
}

function insertParagraphBelow(editor: Editor, path: number[]) {
	const newBlock: ParagraphElement = {
		type: "paragraph",
		children: [{ text: "" }],
	};
	const insertPath = [...path];
	insertPath[insertPath.length - 1] = insertPath[insertPath.length - 1] + 1;
	Transforms.insertNodes(editor, newBlock, { at: insertPath });
	Transforms.select(editor, Editor.start(editor, insertPath));
}

function insertDividerBelow(editor: Editor, path: number[]) {
	const newBlock: DividerElement = {
		type: "divider",
		children: [{ text: "" }],
	};
	const insertPath = [...path];
	insertPath[insertPath.length - 1] = insertPath[insertPath.length - 1] + 1;
	Transforms.insertNodes(editor, newBlock, { at: insertPath });
}

async function insertImageBelow(
	editor: Editor,
	path: number[],
	fileOrUrl: File | string
) {
	let url: string;
	if (typeof fileOrUrl === "string") url = fileOrUrl;
	else
		url = await new Promise<string>((res, rej) => {
			const r = new FileReader();
			r.onload = () => res(r.result as string);
			r.onerror = () => rej(r.error ?? new Error("read error"));
			r.readAsDataURL(fileOrUrl);
		});
	const node: ImageElement = { type: "image", url, children: [{ text: "" }] };
	const insertPath = [...path];
	insertPath[insertPath.length - 1] = insertPath[insertPath.length - 1] + 1;
	Transforms.insertNodes(editor, node, { at: insertPath });
	// Crear párrafo debajo y enfocar
	const paragraphPath = [...insertPath];
	paragraphPath[paragraphPath.length - 1] += 1;
	const paragraph: ParagraphElement = {
		type: "paragraph",
		children: [{ text: "" }],
	};
	Transforms.insertNodes(editor, paragraph, { at: paragraphPath });
	Transforms.select(editor, Editor.start(editor, paragraphPath));
}

function deleteBlock(editor: Editor, path: number[]) {
	try {
		Transforms.removeNodes(editor, { at: path });
		// Si documento vacío, insertar un párrafo
		if (editor.children.length === 0) {
			Transforms.insertNodes(
				editor,
				{
					type: "paragraph",
					children: [{ text: "" }],
				} as unknown as SlateElement,
				{ at: [0] }
			);
			Transforms.select(editor, Editor.start(editor, [0]));
		}
	} catch {
		/* ignore */
	}
}

const BlockActions = ({
	editor,
	element,
	visible,
}: {
	editor: Editor;
	element: SlateElement;
	visible: boolean;
}) => {
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const open = Boolean(anchorEl);
	const path = ReactEditor.findPath(
		editor as ReactEditor,
		element
	) as unknown as number[];
	const fileInputRef = useRef<HTMLInputElement>(null);

	const move = (dir: number) => {
		const newPath = [...path];
		newPath[newPath.length - 1] = newPath[newPath.length - 1] + dir;
		if (newPath[newPath.length - 1] < 0) return;
		Transforms.moveNodes(editor, { at: path, to: newPath });
	};
	const handleAdd = (cb: () => void) => {
		cb();
		setAnchorEl(null);
	};
	if (!visible && !anchorEl) {
		return null;
	}
	return (
		<Box
			contentEditable={false}
			sx={{
				position: "absolute",
				left: 4,
				top: 2,
				display: "flex",
				flexDirection: "column",
				gap: 0.5,
				bgcolor: "rgba(45,45,45,.75)",
				p: 0.5,
				borderRadius: 1,
				boxShadow: 1,
				opacity: 0.9,
				transition: "opacity .12s",
				"&:hover": { opacity: 1 },
				zIndex: 2,
			}}
		>
			<IconButton
				size="small"
				onMouseDown={(e) => e.preventDefault()}
				onClick={(e) => setAnchorEl(e.currentTarget)}
			>
				<AddIcon fontSize="inherit" />
			</IconButton>
			<Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
				<MenuItem
					onClick={() => handleAdd(() => move(-1))}
					disabled={path[path.length - 1] === 0}
				>
					<ListItemIcon>
						<ArrowUpwardIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Mover arriba" />
				</MenuItem>
				<MenuItem onClick={() => handleAdd(() => move(1))}>
					<ListItemIcon>
						<ArrowDownwardIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Mover abajo" />
				</MenuItem>
				<MenuItem onClick={() => handleAdd(() => deleteBlock(editor, path))}>
					<ListItemIcon>
						<DeleteIcon fontSize="small" color="error" />
					</ListItemIcon>
					<ListItemText primary="Eliminar" sx={{ color: "error.main" }} />
				</MenuItem>
				<MenuItem
					onClick={() => handleAdd(() => insertParagraphBelow(editor, path))}
				>
					<ListItemIcon>
						<AddIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Parrafo" />
				</MenuItem>
				<MenuItem
					onClick={() =>
						handleAdd(() => {
							toggleBlock(editor, "heading-one");
						})
					}
				>
					<ListItemIcon>
						<LooksOneIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Heading 1" />
				</MenuItem>
				<MenuItem
					onClick={() =>
						handleAdd(() => {
							toggleBlock(editor, "heading-two");
						})
					}
				>
					<ListItemIcon>
						<LooksTwoIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Heading 2" />
				</MenuItem>
				<MenuItem
					onClick={() => handleAdd(() => insertDividerBelow(editor, path))}
				>
					<ListItemIcon>
						<HorizontalRuleIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Divider" />
				</MenuItem>
				<MenuItem
					onClick={() => {
						fileInputRef.current?.click();
					}}
				>
					<ListItemIcon>
						<ImageIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Imagen" />
				</MenuItem>
				<MenuItem
					onClick={() =>
						handleAdd(() =>
							insertImageBelow(editor, path, prompt("URL imagen") || "")
						)
					}
				>
					<ListItemIcon>
						<ImageIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText primary="Imagen URL" />
				</MenuItem>
			</Menu>
			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				style={{ display: "none" }}
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) {
						insertImageBelow(editor, path, f);
					}
					setAnchorEl(null);
					e.target.value = "";
				}}
			/>
		</Box>
	);
};

interface ElementProps {
	attributes: Record<string, unknown>;
	children: React.ReactNode;
	element: SlateElement & { type: string; url?: string };
	editor: Editor;
}
const Element = ({ attributes, children, element, editor }: ElementProps) => {
	const selected = useSelected();
	const focused = useFocused();
	const [hover, setHover] = React.useState(false);
	// Fallback: comprobar selección manual por path (a veces useSelected falla tras borrar nodos)
	let manualActive = false;
	try {
		const sel = editor.selection;
		if (sel) {
			const [start] = Range.edges(sel);
			const elementPath = ReactEditor.findPath(
				editor as ReactEditor,
				element
			) as unknown as number[];
			if (start.path[0] === elementPath[0]) manualActive = true;
		}
	} catch {
		/* ignore selection path issues */
	}
	const show = (selected && focused) || hover || manualActive; // mostrar en selección o hover
	const GUTTER = 48; // espacio para la barra
	const needsGutter = !["list-item"].includes(element.type);
	const wrapperStyle: React.CSSProperties = {
		position: "relative",
		paddingLeft: needsGutter ? GUTTER : 0,
		overflow: "visible",
	};
	switch (element.type) {
		case "heading-one":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<h1
						{...attributes}
						style={{ fontSize: "1.9rem", margin: "1.2rem 0 .6rem" }}
					>
						{children}
					</h1>
				</div>
			);
		case "heading-two":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<h2
						{...attributes}
						style={{ fontSize: "1.5rem", margin: "1rem 0 .5rem" }}
					>
						{children}
					</h2>
				</div>
			);
		case "bulleted-list":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<ul {...attributes} style={{ marginLeft: 20 }}>
						{children}
					</ul>
				</div>
			);
		case "numbered-list":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<ol {...attributes} style={{ marginLeft: 20 }}>
						{children}
					</ol>
				</div>
			);
		case "list-item":
			return <li {...attributes}>{children}</li>;
		case "block-quote":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<blockquote
						{...attributes}
						style={{
							borderLeft: "3px solid #888",
							margin: "8px 0",
							padding: "4px 12px",
							opacity: 0.9,
						}}
					>
						{children}
					</blockquote>
				</div>
			);
		case "code-block":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<pre
						{...attributes}
						style={{
							background: "#1e1e1e",
							color: "#dcdcdc",
							padding: 12,
							borderRadius: 6,
							overflowX: "auto",
							fontFamily: "Menlo,Consolas,monospace",
							whiteSpace: "pre-wrap",
						}}
					>
						<code>{children}</code>
					</pre>
				</div>
			);
		case "divider":
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<hr
						{...attributes}
						style={{
							border: "none",
							borderTop: "1px solid #444",
							margin: "16px 0",
						}}
					/>
				</div>
			);
		case "image":
			return (
				<div
					role="presentation"
					style={{ position: "relative", margin: "12px 0" }}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<img
						{...attributes}
						src={element.url}
						alt=""
						style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
					/>
					{children}
				</div>
			);
		default:
			return (
				<div
					role="presentation"
					style={wrapperStyle}
					onMouseEnter={() => setHover(true)}
					onMouseLeave={() => setHover(false)}
				>
					<BlockActions editor={editor} element={element} visible={show} />
					<p {...attributes} style={{ margin: "4px 0" }}>
						{children}
					</p>
				</div>
			);
	}
};

// Leaf: relaxed attribute typing but without `any`
interface LeafAttrMap {
	[key: string]: unknown;
}
const Leaf = ({
	attributes,
	children,
	leaf,
}: {
	attributes: LeafAttrMap;
	children: React.ReactNode;
	leaf: CustomText;
}) => {
	let out: React.ReactNode = children;
	if (leaf.bold) out = <strong>{out}</strong>;
	if (leaf.italic) out = <em>{out}</em>;
	if (leaf.code) {
		out = (
			<code
				style={{ background: "#2a2f3a", padding: "2px 4px", borderRadius: 4 }}
			>
				{out}
			</code>
		);
	}
	return <span {...attributes}>{out}</span>;
};

interface ToolButtonProps {
	format: string;
	icon: React.ReactNode;
	onClick: () => void;
	editor: Editor;
}
const ToolBtn: React.FC<ToolButtonProps> = ({
	format,
	icon,
	onClick,
	editor,
}) => (
	<Tooltip title={format}>
		<IconButton
			size="small"
			onMouseDown={(e) => {
				e.preventDefault();
				onClick();
			}}
			color={
				isMarkActive(editor, format) || isBlockActive(editor, format)
					? "primary"
					: "default"
			}
		>
			{icon}
		</IconButton>
	</Tooltip>
);

export default function RichEditor({
	value,
	onChange,
}: Readonly<RichEditorProps>) {
	// Runtime guard: ensure array structure
	const safeValue = Array.isArray(value) ? value : newInitial();
	const initial = useMemo<Descendant[]>(
		() => (safeValue?.length ? safeValue : newInitial()),
		[safeValue]
	);
	const editor = useMemo(
		() =>
			withImages(
				withCodeBlock(withShortcuts(withReact(createEditor() as ReactEditor)))
			),
		[]
	);
	const [internal, setInternal] = useState<Descendant[]>(initial);
	const handleChange = (val: Descendant[]) => {
		setInternal(val);
		onChange(val);
	};
	const handleKeyDown = (event: React.KeyboardEvent) => {
		for (const hotkey in HOTKEYS) {
			const [mod, key] = hotkey.split("+");
			if (
				mod === "mod" &&
				(event.metaKey || event.ctrlKey) &&
				event.key === key
			) {
				event.preventDefault();
				toggleMark(editor, HOTKEYS[hotkey]);
			}
		}
	};
	return (
		<Box>
			<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1 }}>
				<ToolBtn
					format="bold"
					icon={<FormatBoldIcon fontSize="small" />}
					onClick={() => toggleMark(editor, "bold")}
					editor={editor}
				/>
				<ToolBtn
					format="italic"
					icon={<FormatItalicIcon fontSize="small" />}
					onClick={() => toggleMark(editor, "italic")}
					editor={editor}
				/>
				<ToolBtn
					format="code"
					icon={<CodeIcon fontSize="small" />}
					onClick={() => toggleMark(editor, "code")}
					editor={editor}
				/>
				<Divider flexItem orientation="vertical" />
				<ToolBtn
					format="heading-one"
					icon={<LooksOneIcon fontSize="small" />}
					onClick={() => toggleBlock(editor, "heading-one")}
					editor={editor}
				/>
				<ToolBtn
					format="heading-two"
					icon={<LooksTwoIcon fontSize="small" />}
					onClick={() => toggleBlock(editor, "heading-two")}
					editor={editor}
				/>
				<ToolBtn
					format="bulleted-list"
					icon={<ListIcon fontSize="small" />}
					onClick={() => toggleBlock(editor, "bulleted-list")}
					editor={editor}
				/>
				<ToolBtn
					format="numbered-list"
					icon={<NumbersIcon fontSize="small" />}
					onClick={() => toggleBlock(editor, "numbered-list")}
					editor={editor}
				/>
				<ToolBtn
					format="block-quote"
					icon={<QuoteIcon fontSize="small" />}
					onClick={() => toggleBlock(editor, "block-quote")}
					editor={editor}
				/>
				<ToolBtn
					format="code-block"
					icon={<CodeIcon fontSize="small" />}
					onClick={() => toggleBlock(editor, "code-block")}
					editor={editor}
				/>
			</Box>
			<Slate editor={editor} initialValue={internal} onChange={handleChange}>
				<Editable
					renderElement={(p) => <Element {...p} editor={editor} />}
					renderLeaf={(p) => <Leaf {...p} />}
					onKeyDown={handleKeyDown}
					spellCheck
					autoFocus
					style={{ minHeight: 300, outline: "none" }}
				/>
			</Slate>
		</Box>
	);
}
