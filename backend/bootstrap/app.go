package bootstrap

// Application encapsulates the runtime dependencies and config.
type Application struct {
	Env *Env
}

// App bootstraps the application dependencies.
func App() Application {
	app := &Application{}
	app.Env = NewEnv()
	return *app
}
