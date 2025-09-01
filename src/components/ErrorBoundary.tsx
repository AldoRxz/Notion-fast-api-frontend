import React from "react";

interface Props {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

interface State {
	hasError: boolean;
	error?: Error;
}

export default class ErrorBoundary extends React.Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error("Editor crashed:", error, info);
	}

	render() {
		if (this.state.hasError) {
			return (
				this.props.fallback ?? (
					<div
						style={{ padding: 12, border: "1px solid #f00", borderRadius: 6 }}
					>
						<strong>Se produjo un error en el editor.</strong>
						<div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
							{this.state.error?.message}
						</div>
						<button
							style={{ marginTop: 8 }}
							onClick={() =>
								this.setState({ hasError: false, error: undefined })
							}
						>
							Reintentar
						</button>
					</div>
				)
			);
		}
		return this.childrenOrGuard();
	}

	private childrenOrGuard() {
		return this.props.children;
	}
}
