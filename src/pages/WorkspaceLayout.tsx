import { useEffect, useState, useCallback, useContext, useRef } from "react";
import {
	Box,
	Drawer,
	List,
	ListItemButton,
	Toolbar,
	AppBar,
	Typography,
	IconButton,
	Divider,
	Button,
	CircularProgress,
	Dialog,
	DialogTitle,
	DialogContent,
	TextField,
	DialogActions,
	Tooltip,
	Snackbar,
	Alert,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/Logout";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import FolderIcon from "@mui/icons-material/Folder";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DescriptionIcon from "@mui/icons-material/Description";
import { useTheme } from "@mui/material/styles";
import { ThemeModeContext } from "../theme";
import { useAuth } from "../hooks/useAuth";
import {
	listWorkspaces,
	createWorkspace,
	listPages,
	createPage,
	createFolder,
	deletePage,
	patchPageContent,
	getPage,
} from "../services/apiClient";
import type { Workspace, Page } from "../services/apiClient";
import type { Descendant } from "slate";
import RichEditor from "../components/RichEditor";
import ErrorBoundary from "../components/ErrorBoundary";
// buildTree removed; hierarchy computed on the fly

const drawerWidth = 260;

export default function WorkspaceLayout() {
	const { token, logout } = useAuth();
	const [mobileOpen, setMobileOpen] = useState(false);
	const [loadingWs, setLoadingWs] = useState(false);
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [openDialog, setOpenDialog] = useState(false);
	const [wsName, setWsName] = useState("");
	const [creatingWs, setCreatingWs] = useState(false);
	const [selectedWs, setSelectedWs] = useState<string | null>(null);
	// keep raw flat pages from API
	const [pages, setPages] = useState<Page[]>([]);
	const [selectedFolder, setSelectedFolder] = useState<Page | null>(null); // still used for creating inside
	const [loadingPages, setLoadingPages] = useState(false);
	const [openNewPage, setOpenNewPage] = useState(false);
	const [creatingType, setCreatingType] = useState<"page" | "folder">("page");
	const [newPageTitle, setNewPageTitle] = useState("");
	const [newFolderParentId, setNewFolderParentId] = useState<string | null>(
		null
	); // null => root folder
	const [confirmDelete, setConfirmDelete] = useState<Page | null>(null);
	const [selectedPage, setSelectedPage] = useState<Page | null>(null);
	// Editor contents (Slate Descendant[]). We sanitize EVERYTHING coming from backend.
	const [pageContent, setPageContent] = useState<Descendant[] | null>(null);
	const [pageContents, setPageContents] = useState<
		Record<string, Descendant[]>
	>({});
	const [savedPageContents, setSavedPageContents] = useState<
		Record<string, Descendant[]>
	>({});
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [forcedFolders, setForcedFolders] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);
	// helper para guardar explícitamente
	// ---------- Content sanitization helpers (stable via refs to avoid hook deps) ----------
	const EMPTY_DOC: Descendant[] = useRef<Descendant[]>([
		{ type: "paragraph", children: [{ text: "" }] },
	]).current;

	interface RawLeaf {
		text?: unknown;
		bold?: unknown;
		italic?: unknown;
		code?: unknown;
		[key: string]: unknown;
	}
	interface RawNode {
		type?: unknown;
		children?: unknown;
		[key: string]: unknown;
	}
	const sanitizeContentRef = useRef((input: unknown): Descendant[] => {
		if (!Array.isArray(input))
			return EMPTY_DOC.map((n) => JSON.parse(JSON.stringify(n)));
		const out: Descendant[] = [];
		for (const node of input as RawNode[]) {
			if (!node || typeof node !== "object") {
				out.push({ type: "paragraph", children: [{ text: "" }] });
				continue;
			}
			const type = typeof node.type === "string" ? node.type : "paragraph";
			const rawChildren = Array.isArray(node.children) ? node.children : [];
			const children = rawChildren.map((c: RawLeaf | string | null) => {
				if (c == null) return { text: "" };
				if (typeof c === "string") return { text: c };
				if (typeof c === "object") {
					const text = typeof c.text === "string" ? c.text : "";
					const leaf: {
						text: string;
						bold?: true;
						italic?: true;
						code?: true;
					} = { text };
					if (c.bold) leaf.bold = true;
					if (c.italic) leaf.italic = true;
					if (c.code) leaf.code = true;
					return leaf;
				}
				return { text: "" };
			});
			out.push({ type, children } as Descendant);
		}
		if (!out.length) return EMPTY_DOC.map((n) => JSON.parse(JSON.stringify(n)));
		return out;
	});

	const saveCurrentPage = useCallback(async () => {
		if (!token || !selectedPage) return;
		const pid = selectedPage.id;
		const raw = pageContents[pid] ?? pageContent;
		const content = raw ? sanitizeContentRef.current(raw) : EMPTY_DOC;
		// detectar dirty
		const dirty =
			JSON.stringify(pageContents[pid]) !==
			JSON.stringify(savedPageContents[pid]);
		if (!dirty) return;
		setSaving(true);
		try {
			await patchPageContent(token, pid, {
				title: selectedPage.title,
				content,
			});
			setSavedPageContents((m) => ({
				...m,
				[pid]: JSON.parse(JSON.stringify(content)),
			}));
		} finally {
			setSaving(false);
		}
	}, [
		token,
		selectedPage,
		pageContents,
		pageContent,
		savedPageContents,
		EMPTY_DOC,
	]);

	// Atajo Ctrl+S / Cmd+S
	useEffect(() => {
		function handler(e: KeyboardEvent) {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
				e.preventDefault();
				saveCurrentPage();
			}
		}
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [saveCurrentPage]);
	const theme = useTheme();
	const themeMode = useContext(ThemeModeContext);
	const toggle =
		themeMode &&
		typeof (themeMode as { toggle?: () => void }).toggle === "function"
			? (themeMode as { toggle: () => void }).toggle
			: () => {};
	const [createError, setCreateError] = useState<string | null>(null);

	const fetchWorkspaces = useCallback(async () => {
		if (!token) return;
		setLoadingWs(true);
		try {
			setWorkspaces(await listWorkspaces(token));
		} finally {
			setLoadingWs(false);
		}
	}, [token]);
	useEffect(() => {
		fetchWorkspaces();
	}, [fetchWorkspaces]);
	// Auto-select workspace if only one
	// handleSelectWorkspace declared below; split auto-select into another effect after declaration

	const loadPages = useCallback(
		async (wsId: string) => {
			if (!token) return;
			setLoadingPages(true);
			try {
				const raw = await listPages(token, wsId);
				// Normalize possible backend field name mismatch (parent vs parent_page_id)
				const flat: Page[] = raw.map(
					(p: {
						id: string;
						title: string;
						parent_page_id?: string | null;
						parent?: string | null;
						type?: string;
					}) => ({
						id: p.id,
						title: p.title,
						parent_page_id:
							p.parent_page_id !== undefined
								? p.parent_page_id
								: p.parent ?? null,
						type: p.type,
					})
				);
				setPages(flat);
				// Auto-mark all folder type nodes so UI treats them as folders
				setForcedFolders(
					new Set(flat.filter((p) => p.type === "folder").map((p) => p.id))
				);
				// Auto-expand root folders (parent_page_id null) so user sees children immediately
				setExpanded((prev) => {
					const next = new Set(prev);
					flat
						.filter((p) => p.type === "folder" && p.parent_page_id === null)
						.forEach((p) => next.add(p.id));
					return next;
				});
			} finally {
				setLoadingPages(false);
			}
		},
		[token]
	);

	async function handleCreateWs() {
		if (!token || !wsName.trim()) return;
		setCreatingWs(true);
		try {
			const ws = await createWorkspace(token, wsName.trim());
			setWorkspaces((p) => [...p, ws]);
			setWsName("");
			setOpenDialog(false);
		} finally {
			setCreatingWs(false);
		}
	}

	const handleSelectWorkspace = useCallback(
		(id: string) => {
			setSelectedWs(id);
			setSelectedPage(null);
			setSelectedFolder(null);
			setPageContent(null);
			loadPages(id);
		},
		[loadPages]
	);

	useEffect(() => {
		if (!selectedWs && workspaces.length === 1) {
			handleSelectWorkspace(workspaces[0].id);
		}
	}, [workspaces, selectedWs, handleSelectWorkspace]);

	async function handleCreatePage(parent?: Page) {
		if (!token) return;
		if (!selectedWs) {
			setCreateError("Selecciona un workspace primero");
			return;
		}
		if (!newPageTitle.trim()) {
			return;
		}
		// Determine target parent (explicit override newFolderParentId wins)
		const targetParentId =
			newFolderParentId ?? parent?.id ?? selectedFolder?.id ?? null;
		// ensure unique among siblings
		const siblingTitles = pages
			.filter((p) => (p.parent_page_id || null) === targetParentId)
			.map((p) => p.title.toLowerCase());
		let finalTitle = newPageTitle.trim();
		if (siblingTitles.includes(finalTitle.toLowerCase())) {
			let i = 2;
			let candidate = `${finalTitle} (${i})`;
			while (siblingTitles.includes(candidate.toLowerCase())) {
				i++;
				candidate = `${finalTitle} (${i})`;
			}
			finalTitle = candidate;
		}
		if (creatingType === "folder") {
			const folder = await createFolder(token, {
				workspace_id: selectedWs,
				parent_page_id: targetParentId ?? null,
				title: finalTitle,
			});
			if (folder && folder.type !== "folder") folder.type = "folder";
			setForcedFolders((prev) => new Set(prev).add(folder.id));
			setExpanded((prev) => new Set(prev).add(folder.id));
			setNewPageTitle("");
			setOpenNewPage(false);
			await loadPages(selectedWs);
			if (targetParentId) setSelectedFolder(folder);
			else setSelectedFolder(null);
			setCreatingType("page");
			setNewFolderParentId(null);
			return;
		}
		const newPage = await createPage(token, {
			workspace_id: selectedWs,
			parent_page_id: targetParentId ?? null,
			title: finalTitle,
			type: "page",
		});
		setSelectedPage(newPage);
		setPageContents((m) => ({
			...m,
			[newPage.id]: EMPTY_DOC.map((n) => JSON.parse(JSON.stringify(n))),
		}));
		setSavedPageContents((m) => ({
			...m,
			[newPage.id]: EMPTY_DOC.map((n) => JSON.parse(JSON.stringify(n))),
		}));
		await loadPages(selectedWs);
		setNewFolderParentId(null);
		setNewPageTitle("");
		setOpenNewPage(false);
	}

	async function handleSelectPage(page: Page) {
		if (!token) return;
		setSelectedPage(page);
		// Usa cache si existe
		if (pageContents[page.id] !== undefined) {
			setPageContent(pageContents[page.id]);
			return;
		}
		setPageContent(null);
		try {
			const loaded = await getPage(token, page.id);
			const sanitized = sanitizeContentRef.current(loaded.content);
			const cloned = JSON.parse(JSON.stringify(sanitized));
			setPageContents((m) => ({ ...m, [page.id]: cloned }));
			setSavedPageContents((m) => ({
				...m,
				[page.id]: JSON.parse(JSON.stringify(cloned)),
			}));
			setPageContent(cloned);
		} catch (e) {
			console.error(e);
			const empty = EMPTY_DOC.map((n) => JSON.parse(JSON.stringify(n)));
			setPageContents((m) => ({ ...m, [page.id]: empty }));
			setSavedPageContents((m) => ({
				...m,
				[page.id]: JSON.parse(JSON.stringify(empty)),
			}));
			setPageContent(empty);
		}
	}

	// Autosave eliminado: sólo se guarda manualmente con el botón Guardar

	// Derive roots and child accessor from flat list
	// Helper to get parent id from current backend shape
	interface LegacyParent {
		parent?: string | null;
	}
	function getParentId(p: Page | (Page & LegacyParent)): string | null {
		return p.parent_page_id ?? (p as LegacyParent).parent ?? null;
	}

	function toggleExpand(id: string) {
		setExpanded((prev) => {
			const n = new Set(prev);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	}

	function renderNodes(nodes: Page[], depth = 0): React.ReactNode[] {
		return nodes.flatMap((page) => {
			const childNodes = pages.filter((c) => {
				const parentId = getParentId(c);
				return parentId === page.id;
			});
			// folder debug logging removed
			const hasChildren = childNodes.length > 0;
			const isFolder =
				page.type === "folder" || hasChildren || forcedFolders.has(page.id);
			const open = expanded.has(page.id);
			const dirty =
				!isFolder &&
				savedPageContents[page.id] !== undefined &&
				JSON.stringify(pageContents[page.id]) !==
					JSON.stringify(savedPageContents[page.id]);
			return [
				<Box
					key={page.id + ":row"}
					sx={{ display: "flex", alignItems: "center" }}
				>
					<ListItemButton
						dense
						sx={{
							pl: 0.75 + depth * 2.0,
							flex: 1,
							position: "relative",
							"&:before":
								depth > 0
									? {
											content: '""',
											position: "absolute",
											left: 0.75 + (depth - 1) * 2.0 + "rem",
											top: 0,
											bottom: 0,
											width: "1px",
											bgcolor: "divider",
											opacity: 0.3,
									  }
									: undefined,
						}}
						selected={selectedPage?.id === page.id}
						onClick={() => {
							if (isFolder) {
								setSelectedFolder(page);
							} else {
								setSelectedPage(page);
								handleSelectPage(page);
							}
						}}
					>
						{isFolder ? (
							<Box
								onClick={(e) => {
									e.stopPropagation();
									toggleExpand(page.id);
								}}
								sx={{
									display: "flex",
									alignItems: "center",
									mr: 0.5,
									width: 16,
									justifyContent: "center",
									fontSize: 11,
									cursor: "pointer",
									opacity: 0.7,
								}}
							>
								{open ? "▼" : "▶"}
							</Box>
						) : (
							<Box
								sx={{
									mr: 0.5,
									width: 16,
									fontSize: 10,
									textAlign: "center",
									opacity: 0.4,
								}}
							>
								•
							</Box>
						)}
						{isFolder ? (
							<FolderIcon sx={{ fontSize: 15, mr: 0.5, opacity: 0.9 }} />
						) : (
							<DescriptionIcon sx={{ fontSize: 14, mr: 0.5, opacity: 0.7 }} />
						)}
						<Typography
							component="span"
							sx={{
								fontSize: 13,
								lineHeight: 1.1,
								display: "flex",
								alignItems: "center",
								gap: 0.5,
							}}
						>
							{page.title}
							{dirty && (
								<Box
									component="span"
									sx={{
										width: 6,
										height: 6,
										bgcolor: "warning.main",
										borderRadius: "50%",
										display: "inline-block",
									}}
								/>
							)}
						</Typography>
					</ListItemButton>
					<Tooltip title="Eliminar">
						<IconButton
							size="small"
							onClick={() => setConfirmDelete(page)}
							sx={{ mr: 0.5 }}
						>
							🗑️
						</IconButton>
					</Tooltip>
				</Box>,
				...(isFolder && open ? renderNodes(childNodes, depth + 1) : []),
			];
		});
	}

	const drawer = (
		<Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
			<Box sx={{ p: 2, display: "flex", alignItems: "center", gap: 1 }}>
				<Typography variant="subtitle2" sx={{ opacity: 0.7, flex: 1 }}>
					Workspaces (proyectos)
				</Typography>
				<IconButton size="small" onClick={() => setOpenDialog(true)}>
					<AddIcon fontSize="inherit" />
				</IconButton>
			</Box>
			<Divider />
			<Box sx={{ flex: 1, overflowY: "auto" }}>
				{loadingWs && (
					<Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
						<CircularProgress size={20} />
					</Box>
				)}
				<List dense>
					{workspaces.map((w) => {
						const showSlug =
							w.slug && w.slug.toLowerCase() !== w.name.toLowerCase();
						const active = selectedWs === w.id;
						return (
							<Box
								key={w.id}
								sx={{
									mx: 1,
									mb: 1,
									border: "1px solid",
									borderColor: active ? "primary.main" : "divider",
									borderRadius: 1,
									bgcolor: active ? "action.selected" : "background.paper",
									transition: "0.15s",
									cursor: "pointer",
									"&:hover": {
										borderColor: "primary.main",
										bgcolor: active ? "action.selected" : "action.hover",
									},
								}}
								onClick={() => handleSelectWorkspace(w.id)}
							>
								<Box sx={{ px: 1, py: 0.75 }}>
									<Typography
										variant="body2"
										sx={{ fontWeight: 500, lineHeight: 1.1 }}
									>
										{w.name}
									</Typography>
									{showSlug && (
										<Typography variant="caption" sx={{ opacity: 0.65 }}>
											{w.slug}
										</Typography>
									)}
								</Box>
							</Box>
						);
					})}
					{!loadingWs && workspaces.length === 0 && (
						<Typography variant="body2" sx={{ px: 2, py: 1, opacity: 0.7 }}>
							No hay workspaces
						</Typography>
					)}
				</List>
				{selectedWs && (
					<Box
						sx={{
							mt: 1,
							borderTop: "1px solid",
							borderColor: "divider",
							display: "flex",
							flexDirection: "column",
							height: "100%",
						}}
					>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								px: 1,
								py: 0.5,
								gap: 0.5,
							}}
						>
							<Typography variant="caption" sx={{ flex: 1, opacity: 0.7 }}>
								Contenido {selectedFolder && `/ ${selectedFolder.title}`}
							</Typography>
							{selectedFolder ? (
								<>
									<Tooltip title="Nueva subcarpeta">
										<IconButton
											size="small"
											onClick={() => {
												setCreatingType("folder");
												setNewFolderParentId(selectedFolder.id);
												setOpenNewPage(true);
											}}
										>
											{" "}
											<CreateNewFolderIcon fontSize="inherit" />{" "}
										</IconButton>
									</Tooltip>
									<Tooltip title="Nueva página en carpeta">
										<IconButton
											size="small"
											onClick={() => {
												setCreatingType("page");
												setNewFolderParentId(selectedFolder.id);
												setOpenNewPage(true);
											}}
										>
											{" "}
											<DescriptionIcon fontSize="inherit" />{" "}
										</IconButton>
									</Tooltip>
									<Tooltip title="Ir a raíz">
										<Button
											size="small"
											onClick={() => {
												setSelectedFolder(null);
												setNewFolderParentId(null);
											}}
										>
											Raíz
										</Button>
									</Tooltip>
								</>
							) : (
								<>
									<Tooltip title="Nueva carpeta raíz">
										<IconButton
											size="small"
											onClick={() => {
												setCreatingType("folder");
												setNewFolderParentId(null);
												setOpenNewPage(true);
											}}
										>
											{" "}
											<CreateNewFolderIcon fontSize="inherit" />{" "}
										</IconButton>
									</Tooltip>
									<Tooltip title="Nueva página raíz">
										<IconButton
											size="small"
											onClick={() => {
												setCreatingType("page");
												setNewFolderParentId(null);
												setOpenNewPage(true);
											}}
										>
											{" "}
											<DescriptionIcon fontSize="inherit" />{" "}
										</IconButton>
									</Tooltip>
								</>
							)}
						</Box>
						<List dense disablePadding sx={{ overflowY: "auto", flex: 1 }}>
							{loadingPages && (
								<Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
									<CircularProgress size={16} />
								</Box>
							)}
							{!loadingPages &&
								pages.filter((p) => getParentId(p) === null).length === 0 && (
									<Typography
										variant="caption"
										sx={{ px: 2, py: 1, opacity: 0.6 }}
									>
										Vacío. Crea tu primera página.
									</Typography>
								)}
							{renderNodes(pages.filter((p) => getParentId(p) === null))}
						</List>
					</Box>
				)}
			</Box>
			<Divider />
			<Box sx={{ p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
				<Button
					size="small"
					onClick={() => setOpenDialog(true)}
					variant="contained"
				>
					Nuevo workspace
				</Button>
				<Button
					size="small"
					color="error"
					onClick={logout}
					variant="outlined"
					fullWidth
				>
					<LogoutIcon fontSize="small" />
				</Button>
			</Box>
		</Box>
	);

	return (
		<Box
			sx={{
				display: "flex",
				height: "100vh",
				bgcolor: "background.default",
				color: "text.primary",
			}}
		>
			<AppBar
				position="fixed"
				sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
				color="transparent"
				enableColorOnDark
			>
				<Toolbar variant="dense">
					<IconButton
						color="inherit"
						edge="start"
						onClick={() => setMobileOpen(!mobileOpen)}
						sx={{ mr: 1, display: { md: "none" } }}
					>
						<MenuIcon />
					</IconButton>
					<Typography variant="h6" sx={{ flex: 1 }}>
						Wiki
					</Typography>
					<IconButton
						size="small"
						color="inherit"
						onClick={toggle}
						sx={{ mr: 1 }}
					>
						{theme.palette.mode === "light" ? (
							<DarkModeIcon fontSize="small" />
						) : (
							<LightModeIcon fontSize="small" />
						)}
					</IconButton>
				</Toolbar>
			</AppBar>
			<Box
				component="nav"
				sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
			>
				<Drawer
					variant="temporary"
					open={mobileOpen}
					onClose={() => setMobileOpen(false)}
					ModalProps={{ keepMounted: true }}
					sx={{
						display: { xs: "block", md: "none" },
						"& .MuiDrawer-paper": { width: drawerWidth },
					}}
				>
					{drawer}
				</Drawer>
				<Drawer
					variant="permanent"
					sx={{
						display: { xs: "none", md: "block" },
						"& .MuiDrawer-paper": {
							width: drawerWidth,
							boxSizing: "border-box",
						},
					}}
					open
				>
					{drawer}
				</Drawer>
			</Box>
			<Box component="main" sx={{ flex: 1, p: 2, mt: 5, overflow: "auto" }}>
				{!selectedPage && (
					<>
						<Typography variant="h5" sx={{ mb: 2 }}>
							{selectedWs
								? "Selecciona o crea una página"
								: "Selecciona un workspace"}
						</Typography>
						<Typography variant="body2" sx={{ opacity: 0.7 }}>
							Aquí mostraremos la jerarquía y el editor Yoopta.
						</Typography>
					</>
				)}
				{selectedPage && (
					<Box>
						<TextField
							variant="standard"
							value={selectedPage.title}
							onChange={(e) => {
								const t = e.target.value;
								setSelectedPage((p) => (p ? { ...p, title: t } : p));
								if (selectedPage) {
									setPageContents((m) => {
										return m; // título se guarda aparte, no mutar contenido
									});
								}
							}}
							placeholder="Título"
							fullWidth
							sx={{ mb: 2 }}
						/>
						<Box
							sx={{
								border: "1px solid",
								borderColor: "divider",
								borderRadius: 1,
								p: 2,
								minHeight: 300,
							}}
						>
							<ErrorBoundary>
								<RichEditor
									key={selectedPage.id}
									value={pageContent ?? EMPTY_DOC}
									onChange={(val: import("slate").Descendant[]) => {
										try {
											setPageContent(val);
											if (selectedPage)
												setPageContents((m) => ({
													...m,
													[selectedPage.id]: val,
												}));
										} catch (e) {
											console.error("onChange error", e);
										}
									}}
								/>
							</ErrorBoundary>
							<Box sx={{ display: "flex", gap: 1, mt: 1 }}>
								{(() => {
									const pid = selectedPage?.id;
									const dirty = pid
										? JSON.stringify(pageContents[pid]) !==
										  JSON.stringify(savedPageContents[pid])
										: false;
									return (
										<Tooltip title={dirty ? "Ctrl+S" : "Sin cambios"}>
											<span>
												<Button
													size="small"
													variant="contained"
													disabled={!selectedPage || saving || !dirty}
													onClick={saveCurrentPage}
												>
													Guardar
												</Button>
											</span>
										</Tooltip>
									);
								})()}
								{saving && (
									<Typography
										variant="caption"
										sx={{ opacity: 0.6, alignSelf: "center" }}
									>
										Guardando...
									</Typography>
								)}
							</Box>
						</Box>
					</Box>
				)}
			</Box>

			{/* Dialogs */}
			<Dialog
				open={openDialog}
				onClose={() => !creatingWs && setOpenDialog(false)}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle>Nuevo Workspace</DialogTitle>
				<DialogContent>
					<TextField
						autoFocus
						fullWidth
						label="Nombre"
						value={wsName}
						onChange={(e) => setWsName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleCreateWs();
							}
						}}
						margin="dense"
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpenDialog(false)} disabled={creatingWs}>
						Cancelar
					</Button>
					<Button
						onClick={handleCreateWs}
						disabled={!wsName.trim() || creatingWs}
						variant="contained"
					>
						{creatingWs ? "Creando..." : "Crear"}
					</Button>
				</DialogActions>
			</Dialog>
			<Dialog
				open={openNewPage}
				onClose={() => setOpenNewPage(false)}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle>
					{creatingType === "folder" ? "Nueva Carpeta" : "Nueva Página"}
				</DialogTitle>
				<DialogContent>
					{!selectedWs && (
						<Typography variant="caption" color="error">
							Debes seleccionar un workspace.
						</Typography>
					)}
					<TextField
						autoFocus
						fullWidth
						label="Título"
						value={newPageTitle}
						onChange={(e) => setNewPageTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleCreatePage();
							}
						}}
						margin="dense"
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpenNewPage(false)}>Cancelar</Button>
					<Button
						onClick={() => handleCreatePage()}
						disabled={!newPageTitle.trim() || !selectedWs}
						variant="contained"
					>
						Crear
					</Button>
				</DialogActions>
			</Dialog>
			<Dialog
				open={!!confirmDelete}
				onClose={() => setConfirmDelete(null)}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle>
					Eliminar {confirmDelete?.type === "folder" ? "Carpeta" : "Página"}
				</DialogTitle>
				<DialogContent>
					<Typography variant="body2">
						¿Seguro que deseas eliminar "{confirmDelete?.title}"? Se archivará
						en backend.
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmDelete(null)}>Cancelar</Button>
					<Button
						color="error"
						variant="contained"
						onClick={async () => {
							if (!token || !confirmDelete) return;
							try {
								await deletePage(token, confirmDelete.id);
								setConfirmDelete(null);
								setSelectedPage((p) => (p?.id === confirmDelete.id ? null : p));
								loadPages(selectedWs!);
							} catch (e) {
								console.error(e);
							}
						}}
					>
						Eliminar
					</Button>
				</DialogActions>
			</Dialog>
			<Snackbar
				open={!!createError}
				autoHideDuration={3000}
				onClose={() => setCreateError(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
			>
				<Alert severity="warning" onClose={() => setCreateError(null)}>
					{createError}
				</Alert>
			</Snackbar>
		</Box>
	);
}
