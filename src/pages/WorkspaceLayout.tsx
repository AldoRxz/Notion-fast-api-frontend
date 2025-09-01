import { useEffect, useState, useCallback, useContext, useMemo } from 'react';
import { Box, Drawer, List, ListItemButton, ListItemText, Toolbar, AppBar, Typography, IconButton, Divider, Button, CircularProgress, Dialog, DialogTitle, DialogContent, TextField, DialogActions, Tooltip, Snackbar, Alert } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import { useAuth } from '../hooks/useAuth';
import { listWorkspaces, type Workspace, createWorkspace, listPages, type Page, createPage, patchPageContent, getPage, createFolder, deletePage } from '../services/apiClient';
import { useTheme } from '@mui/material/styles';
import { ThemeModeContext } from '../main';
import RichEditor from '../components/RichEditor';

const drawerWidth = 260;

interface PageNode extends Page { children?: PageNode[] }

function buildTree(pages: Page[]): PageNode[] {
  const map: Record<string, PageNode> = {};
  pages.forEach(p => { map[p.id] = { ...p, children: [] }; });
  const roots: PageNode[] = [];
  pages.forEach(p => {
    if (p.parent_page_id && map[p.parent_page_id]) map[p.parent_page_id].children!.push(map[p.id]); else roots.push(map[p.id]);
  });
  return roots;
}

export default function WorkspaceLayout() {
  const { token, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loadingWs, setLoadingWs] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [wsName, setWsName] = useState('');
  const [creatingWs, setCreatingWs] = useState(false);
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [pages, setPages] = useState<PageNode[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Page | null>(null); // still used for creating inside
  const [loadingPages, setLoadingPages] = useState(false);
  const [openNewPage, setOpenNewPage] = useState(false);
  const [creatingType, setCreatingType] = useState<'page'|'folder'>('page');
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null); // null => root folder
  const [confirmDelete, setConfirmDelete] = useState<Page | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [pageContent, setPageContent] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [forcedFolders, setForcedFolders] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const theme = useTheme();
  const { toggle } = useContext(ThemeModeContext);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (!token) return; setLoadingWs(true);
    try { setWorkspaces(await listWorkspaces(token)); } finally { setLoadingWs(false); }
  }, [token]);
  useEffect(() => { fetchWorkspaces(); }, [fetchWorkspaces]);
  // Auto-select workspace if only one
  useEffect(() => { if (!selectedWs && workspaces.length === 1) { handleSelectWorkspace(workspaces[0].id); } }, [workspaces, selectedWs]);

  const loadPages = useCallback(async (wsId: string) => {
    if (!token) return; setLoadingPages(true);
    try {
      const flat = await listPages(token, wsId);
      console.log('Pages loaded', flat.map(p=>({id:p.id,title:p.title,type:p.type,parent:p.parent_page_id})));
      const foldersDbg = flat.filter(p=> p.type==='folder');
      if (foldersDbg.length===0) console.log('No folder type items present');
      setPages(buildTree(flat));
    } finally { setLoadingPages(false); }
  }, [token]);

  async function handleCreateWs() {
    if (!token || !wsName.trim()) return; setCreatingWs(true);
    try { const ws = await createWorkspace(token, wsName.trim()); setWorkspaces(p=>[...p, ws]); setWsName(''); setOpenDialog(false); } finally { setCreatingWs(false); }
  }

  async function handleSelectWorkspace(id: string) { setSelectedWs(id); setSelectedPage(null); setSelectedFolder(null); setPageContent(null); loadPages(id); }

  async function handleCreatePage(parent?: Page) {
  if (!token) return;
  if (!selectedWs) { setCreateError('Selecciona un workspace primero'); return; }
  if (!newPageTitle.trim()) return;
    // Determine target parent (explicit override newFolderParentId wins)
    const targetParentId = newFolderParentId !== null ? newFolderParentId : (parent?.id || selectedFolder?.id || null);
    // ensure unique among siblings
    const siblingTitles = pages.filter(p => (p.parent_page_id||null) === targetParentId).map(p=> p.title.toLowerCase());
    let finalTitle = newPageTitle.trim();
    if (siblingTitles.includes(finalTitle.toLowerCase())) {
      let i=2; let candidate = `${finalTitle} (${i})`;
      while (siblingTitles.includes(candidate.toLowerCase())) { i++; candidate = `${finalTitle} (${i})`; }
      finalTitle = candidate;
    }
    if (creatingType === 'folder') {
      console.log('Creating folder', { parent: newFolderParentId, title: newPageTitle });
      const folder = await createFolder(token, { workspace_id: selectedWs, parent_page_id: targetParentId ?? null, title: finalTitle });
  if (folder && folder.type !== 'folder') { console.warn('Backend devolvió type != folder, forzando en UI'); (folder as any).type = 'folder'; }
  setForcedFolders(prev => new Set(prev).add(folder.id));
      setNewPageTitle(''); setOpenNewPage(false); loadPages(selectedWs);
      if (targetParentId) setSelectedFolder(folder); else setSelectedFolder(null); // root stays collapsed selection
      setCreatingType('page');
      setNewFolderParentId(null);
      return;
    }
  const page = await createPage(token, { workspace_id: selectedWs, parent_page_id: targetParentId, title: finalTitle });
    setNewPageTitle(''); setOpenNewPage(false);
    // reload pages
    loadPages(selectedWs);
    setSelectedPage(page);
    const loaded = await getPage(token, page.id);
    setPageContent(loaded.content || {});
  setNewFolderParentId(null);
  }

  async function handleSelectPage(page: Page) {
    setSelectedPage(page); setPageContent(null);
    const loaded = await getPage(token!, page.id); setPageContent(loaded.content || {});
  }

  // Debounced autosave (simple)
  useEffect(() => {
    if (!token || !selectedPage) return;
    const id = setTimeout(async () => {
      if (pageContent) { setSaving(true); try { await patchPageContent(token, selectedPage.id, { content: pageContent }); } finally { setSaving(false); } }
    }, 800);
    return () => clearTimeout(id);
  }, [pageContent, selectedPage, token]);

  // Derived collections & helpers (support nested folders)
  // Build full tree including pages & folders (any node can have children)
  interface TreeNode extends Page { children: TreeNode[] }
  const tree: TreeNode[] = useMemo(() => {
    const flat: Record<string, TreeNode> = {};
    function normalize(p: Page): TreeNode { return { ...(p as any), children: [] }; }
    pages.forEach(p => { flat[p.id] = normalize(p as any); });
    const roots: TreeNode[] = [];
    pages.forEach(p => {
      if (p.parent_page_id && flat[p.parent_page_id]) flat[p.parent_page_id].children.push(flat[p.id]); else roots.push(flat[p.id]);
    });
    return roots;
  }, [pages]);

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function renderNodes(nodes: TreeNode[], depth=0): React.ReactNode[] {
    return nodes.flatMap(n => {
  const hasChildren = n.children.length>0;
  const isFolder = n.type === 'folder' || hasChildren || forcedFolders.has(n.id); // treat forced IDs as folders
      const open = expanded.has(n.id);
      return [
        <Box key={n.id+':row'} sx={{ display:'flex', alignItems:'center' }}>
          <ListItemButton
            dense
            sx={{
              pl: 0.75 + depth*2.0,
              flex:1,
              position:'relative',
              '&:before': depth>0 ? { content:'""', position:'absolute', left: (0.75 + (depth-1)*2.0)+'rem', top:0, bottom:0, width: '1px', bgcolor:'divider', opacity:0.3 } : undefined
            }}
            selected={selectedPage?.id===n.id}
            onClick={()=> {
              if (isFolder) { setSelectedFolder(n); } else { setSelectedPage(n); handleSelectPage(n); }
            }}
          >
            {isFolder ? (
              <Box onClick={e=> { e.stopPropagation(); toggleExpand(n.id); }} sx={{ display:'flex', alignItems:'center', mr:.5, width:16, justifyContent:'center', fontSize:11, cursor:'pointer', opacity:.7 }}>
                {open ? '▼' : '▶'}
              </Box>
            ) : <Box sx={{ mr:.5, width:16, fontSize:10, textAlign:'center', opacity:.4 }}>•</Box>}
            {isFolder ? <FolderIcon sx={{ fontSize:15, mr:.5, opacity:.9 }} /> : <DescriptionIcon sx={{ fontSize:14, mr:.5, opacity:.7 }} />}
            <ListItemText primaryTypographyProps={{ fontSize:13 }} primary={n.title} />
          </ListItemButton>
          <Tooltip title="Eliminar">
            <IconButton size="small" onClick={()=> setConfirmDelete(n)} sx={{ mr:.5 }}>🗑️</IconButton>
          </Tooltip>
        </Box>,
        ...(isFolder && open ? renderNodes(n.children, depth+1) : [])
      ];
    });
  }

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 2, display:'flex', alignItems:'center', gap:1 }}>
  <Typography variant="subtitle2" sx={{ opacity: 0.7, flex:1 }}>Workspaces (proyectos)</Typography>
        <IconButton size="small" onClick={()=> setOpenDialog(true)}><AddIcon fontSize="inherit" /></IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loadingWs && <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}><CircularProgress size={20} /></Box>}
        <List dense>
          {workspaces.map(w => {
            const showSlug = w.slug && w.slug.toLowerCase() !== w.name.toLowerCase();
            const active = selectedWs===w.id;
            return (
              <Box key={w.id} sx={{ mx:1, mb:1, border:'1px solid', borderColor: active? 'primary.main':'divider', borderRadius:1, bgcolor: active? 'action.selected':'background.paper', transition:'0.15s', cursor:'pointer', '&:hover':{ borderColor:'primary.main', bgcolor: active? 'action.selected':'action.hover' } }} onClick={()=> handleSelectWorkspace(w.id)}>
                <Box sx={{ px:1, py:.75 }}>
                  <Typography variant="body2" sx={{ fontWeight:500, lineHeight:1.1 }}>{w.name}</Typography>
                  {showSlug && <Typography variant="caption" sx={{ opacity:.65 }}>{w.slug}</Typography>}
                </Box>
              </Box>
            );
          })}
          {!loadingWs && workspaces.length === 0 && <Typography variant="body2" sx={{ px: 2, py: 1, opacity: 0.7 }}>No hay workspaces</Typography>}
        </List>
        {selectedWs && (
          <Box sx={{ mt:1, borderTop:'1px solid', borderColor:'divider', display:'flex', flexDirection:'column', height:'100%' }}>
            <Box sx={{ display:'flex', alignItems:'center', px:1, py:.5, gap:.5 }}>
              <Typography variant="caption" sx={{ flex:1, opacity:.7 }}>Contenido {selectedFolder && `/ ${selectedFolder.title}`}</Typography>
              {selectedFolder ? (
                <>
                  <Tooltip title="Nueva subcarpeta">
                    <IconButton size="small" onClick={()=> { setCreatingType('folder'); setNewFolderParentId(selectedFolder.id); setOpenNewPage(true); }}> <CreateNewFolderIcon fontSize="inherit" /> </IconButton>
                  </Tooltip>
                  <Tooltip title="Nueva página en carpeta">
                    <IconButton size="small" onClick={()=> { setCreatingType('page'); setNewFolderParentId(selectedFolder.id); setOpenNewPage(true); }}> <DescriptionIcon fontSize="inherit" /> </IconButton>
                  </Tooltip>
                  <Tooltip title="Ir a raíz">
                    <Button size="small" onClick={()=> { setSelectedFolder(null); setNewFolderParentId(null); }}>Raíz</Button>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Tooltip title="Nueva carpeta raíz">
                    <IconButton size="small" onClick={()=> { setCreatingType('folder'); setNewFolderParentId(null); setOpenNewPage(true); }}> <CreateNewFolderIcon fontSize="inherit" /> </IconButton>
                  </Tooltip>
                  <Tooltip title="Nueva página raíz">
                    <IconButton size="small" onClick={()=> { setCreatingType('page'); setNewFolderParentId(null); setOpenNewPage(true); }}> <DescriptionIcon fontSize="inherit" /> </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
            <List dense disablePadding sx={{ overflowY:'auto', flex:1 }}>
              {loadingPages && <Box sx={{ display:'flex', justifyContent:'center', py:1 }}><CircularProgress size={16} /></Box>}
              {!loadingPages && tree.length===0 && <Typography variant="caption" sx={{ px:2, py:1, opacity:.6 }}>Vacío. Crea tu primera página.</Typography>}
              {renderNodes(tree)}
            </List>
          </Box>
        )}
      </Box>
      <Divider />
      <Box sx={{ p: 1, display: 'flex', flexDirection:'column', gap: 1 }}>
        <Button size="small" onClick={()=> setOpenDialog(true)} variant="contained">Nuevo workspace</Button>
        <Button size="small" color="error" onClick={logout} variant="outlined" fullWidth><LogoutIcon fontSize="small" /></Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }} color="transparent" enableColorOnDark>
        <Toolbar variant="dense">
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 1, display: { md: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flex: 1 }}>Notion Clone</Typography>
          <IconButton size="small" color="inherit" onClick={toggle} sx={{ mr: 1 }}>
            {theme.palette.mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}>{drawer}</Drawer>
        <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }} open>{drawer}</Drawer>
      </Box>
      <Box component="main" sx={{ flex: 1, p: 2, mt: 5, overflow: 'auto' }}>
        {!selectedPage && <>
          <Typography variant="h5" sx={{ mb: 2 }}>{selectedWs ? 'Selecciona o crea una página' : 'Selecciona un workspace'}</Typography>
          <Typography variant="body2" sx={{ opacity: 0.7 }}>Aquí mostraremos la jerarquía y el editor Yoopta.</Typography>
        </>}
        {selectedPage && (
          <Box>
            <TextField variant="standard" value={selectedPage.title} onChange={e=> { const t=e.target.value; setSelectedPage(p=> p? {...p, title:t}:p); setPageContent((c:any)=> ({...(Array.isArray(c)? c: []), __title:t})); }} placeholder="Título" fullWidth sx={{ mb:2 }} />
            <Box sx={{ border:'1px solid', borderColor:'divider', borderRadius:1, p:2, minHeight:300 }}>
              <RichEditor value={pageContent} onChange={setPageContent} />
              {saving && <Typography variant="caption" sx={{ opacity:.6 }}>Guardando...</Typography>}
            </Box>
          </Box>
        )}
      </Box>

      {/* Dialogs */}
      <Dialog open={openDialog} onClose={()=> !creatingWs && setOpenDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Nuevo Workspace</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="Nombre" value={wsName} onChange={e=> setWsName(e.target.value)} onKeyDown={e=> { if(e.key==='Enter'){ e.preventDefault(); handleCreateWs(); }}} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setOpenDialog(false)} disabled={creatingWs}>Cancelar</Button>
          <Button onClick={handleCreateWs} disabled={!wsName.trim() || creatingWs} variant="contained">{creatingWs ? 'Creando...' : 'Crear'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={openNewPage} onClose={()=> setOpenNewPage(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{creatingType==='folder' ? 'Nueva Carpeta' : 'Nueva Página'}</DialogTitle>
        <DialogContent>
          {!selectedWs && <Typography variant="caption" color="error">Debes seleccionar un workspace.</Typography>}
          <TextField autoFocus fullWidth label="Título" value={newPageTitle} onChange={e=> setNewPageTitle(e.target.value)} onKeyDown={e=> { if(e.key==='Enter'){ e.preventDefault(); handleCreatePage(); }}} margin="dense" />
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setOpenNewPage(false)}>Cancelar</Button>
          <Button onClick={()=> handleCreatePage()} disabled={!newPageTitle.trim() || !selectedWs} variant="contained">Crear</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!confirmDelete} onClose={()=> setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar {(confirmDelete?.type==='folder' ? 'Carpeta' : 'Página')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">¿Seguro que deseas eliminar "{confirmDelete?.title}"? Se archivará en backend.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=> setConfirmDelete(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={async ()=> { if(!token||!confirmDelete) return; try { await deletePage(token, confirmDelete.id); setConfirmDelete(null); setSelectedPage(p=> p?.id===confirmDelete.id? null:p); loadPages(selectedWs!); } catch(e) { console.error(e); } }}>Eliminar</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!createError} autoHideDuration={3000} onClose={()=> setCreateError(null)} anchorOrigin={{ vertical:'bottom', horizontal:'center' }}>
        <Alert severity="warning" onClose={()=> setCreateError(null)}>{createError}</Alert>
      </Snackbar>
    </Box>
  );
}
