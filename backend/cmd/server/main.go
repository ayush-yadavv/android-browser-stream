package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/user/android-browser-stream/backend/api/route"
	"github.com/user/android-browser-stream/backend/bootstrap"
	"github.com/user/android-browser-stream/backend/domain"
	"github.com/user/android-browser-stream/backend/infrastructure/adb"
	"github.com/user/android-browser-stream/backend/infrastructure/docker"
	"github.com/user/android-browser-stream/backend/infrastructure/portpool"
	"github.com/user/android-browser-stream/backend/repository"
	"github.com/user/android-browser-stream/backend/usecase"
)

func main() {
	app := bootstrap.App()
	env := app.Env

	// 1. Initialize SQLite database & migrations
	db, err := bootstrap.NewSQLiteDatabase(env)
	if err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer db.Close()

	// 2. Initialize Docker container orchestrator
	dockerClient, err := docker.NewClient()
	if err != nil {
		log.Fatalf("Docker client initialization failed: %v", err)
	}
	if err := dockerClient.Ping(context.Background()); err != nil {
		log.Printf("WARNING: Docker daemon ping failed: %v (is Docker running?)", err)
	} else {
		log.Println("Connected to Docker daemon successfully")
	}

	// 3. Initialize host port allocator
	pool := portpool.New(env.ADBPortStart, env.MaxSessions)

	// 4. Initialize session repository
	sessionRepo := repository.NewSQLiteSessionRepository(db)

	// 5. Initialize session usecase
	sessionCfg := usecase.SessionConfig{
		Image:        env.RedroidImage,
		MaxSessions:  env.MaxSessions,
		DeviceWidth:  1080,
		DeviceHeight: 1920,
		DeviceDPI:    420,
		DeviceFPS:    60,
		GPUMode:      "guest",
		IdleTimeout:  5 * time.Minute,
		BootTimeout:  45 * time.Second,
	}

	// 6. Initialize ADB client & optional PrewarmedPool
	adbClient := adb.NewClient()

	var prewarmedPool *docker.PrewarmedPool
	var sessionOpts []usecase.SessionOption
	sessionOpts = append(sessionOpts, usecase.WithADBDisconnector(adbClient))

	if env.PrewarmedPoolSize > 0 {
		poolCfg := docker.PrewarmedPoolConfig{
			PoolSize:      env.PrewarmedPoolSize,
			BootTimeout:   sessionCfg.BootTimeout,
			ScrcpyBinPath: env.ScrcpyBinPath,
			ContainerConfig: domain.ContainerConfig{
				Image:       env.RedroidImage,
				Width:       1080,
				Height:      1920,
				DPI:         420,
				FPS:         60,
				GPUMode:     "guest",
				MemoryLimit: 4 * 1024 * 1024 * 1024,
				CPULimit:    2 * 1e9,
			},
		}
		prewarmedPool = docker.NewPrewarmedPool(poolCfg, dockerClient, pool, adbClient)
		prewarmedPool.Start(context.Background())
		sessionOpts = append(sessionOpts, usecase.WithPrewarmedPool(prewarmedPool))
		log.Printf("Pre-warmed container pool enabled (size: %d, Option B: scrcpy pre-pushed)", env.PrewarmedPoolSize)
	}

	sessionUC := usecase.NewSessionUsecase(sessionRepo, dockerClient, pool, sessionCfg, env.ContextTimeout, sessionOpts...)
	streamUC := usecase.NewStreamUsecase(adbClient, sessionRepo, env.ScrcpyBinPath, usecase.WithContainerRepo(dockerClient))

	// 7. Background worker for stale session reclamation
	tickerStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				_ = sessionUC.CleanupStaleSessions(ctx, 5*time.Minute)
				cancel()
			case <-tickerStop:
				return
			}
		}
	}()

	// 8. Route setup & Gin engine
	router := gin.Default()
	route.Setup(env, router, sessionUC, streamUC)

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", env.ServerPort),
		Handler: router,
	}

	// 8. Run server in background goroutine
	go func() {
		log.Printf("Server starting on %s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server failed to run: %v", err)
		}
	}()

	// 9. Trap OS signals for graceful shutdown & container cleanup
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	sig := <-quit
	log.Printf("Received signal %s, initiating graceful shutdown...", sig)

	close(tickerStop)

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	// Clean up all active containers before exit to prevent orphaned processes
	activeSessions, err := sessionRepo.List(shutdownCtx)
	if err == nil {
		for _, s := range activeSessions {
			if s.Status != domain.SessionStatusTerminated {
				log.Printf("Cleaning up active container for session %s...", s.ID)
				_ = sessionUC.DestroySession(shutdownCtx, s.ID)
			}
		}
	}

	if prewarmedPool != nil {
		log.Println("Stopping pre-warmed container pool...")
		prewarmedPool.Stop()
	}

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server gracefully stopped.")
}
