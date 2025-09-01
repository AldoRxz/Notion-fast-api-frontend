import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider, CssBaseline, IconButton, Box } from "@mui/material";
import { buildTheme, ThemeModeContext } from "./theme";
import { useMemo, useState } from "react";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";

export function Root() {
	const [mode, setMode] = useState<"light" | "dark">(
		window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
	);
	const theme = useMemo(() => buildTheme(mode), [mode]);
	const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));
	return (
		<ThemeModeContext.Provider value={{ toggle }}>
			<ThemeProvider theme={theme}>
				<CssBaseline />
				<Box
					sx={{
						minHeight: "100vh",
						width: "100%",
						display: "flex",
						flexDirection: "column",
						background:
							theme.palette.mode === "dark"
								? "radial-gradient(circle at 25% 20%, #1c2430 0%, #0d1117 55%)"
								: "radial-gradient(circle at 25% 20%, #f5f8ff 0%, #eef2f8 55%)",
						transition: "background .6s",
					}}
				>
					<Box sx={{ position: "fixed", top: 10, right: 12, zIndex: 1200 }}>
						<IconButton
							size="small"
							color="primary"
							onClick={toggle}
							aria-label="toggle theme"
							sx={{ bgcolor: "background.paper", boxShadow: 2 }}
						>
							{theme.palette.mode === "light" ? (
								<DarkModeIcon fontSize="small" />
							) : (
								<LightModeIcon fontSize="small" />
							)}
						</IconButton>
					</Box>
					<BrowserRouter>
						<AuthProvider>
							<App />
						</AuthProvider>
					</BrowserRouter>
				</Box>
			</ThemeProvider>
		</ThemeModeContext.Provider>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Root />
	</StrictMode>
);
