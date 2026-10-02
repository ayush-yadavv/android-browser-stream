# Go Backend Clean Architecture: AI Agent Development Guidelines & Best Practices

> **Reference Repository:** [amitshekhariitbhu/go-backend-clean-architecture](https://github.com/amitshekhariitbhu/go-backend-clean-architecture)  
> **Target Audience:** Autonomous AI Agents & Software Engineers implementing, refactoring, and maintaining production-grade Go backend services.

---

## 1. Executive Summary & Core Philosophy

This architecture enforces **Uncle Bob's Clean Architecture** principles adapted specifically for idiomatic Golang. The core architectural invariant is the **Dependency Inversion Principle (DIP)**:

> **The Dependency Rule:** Dependencies must only point **inward** toward the core domain. Outer layers (HTTP, Database drivers, CLI, Frameworks) depend on inner layers (Use Cases, Domain Entities). Inner layers **never** import or depend on outer layers.

```
       +-------------------------------------------------------+
       | Frameworks & Drivers: Gin, Mongo Driver, Viper, Docker|
       |  +-------------------------------------------------+  |
       |  | Interface Adapters: Controllers, Repositories   |  |
       |  |  +-------------------------------------------+  |  |
       |  |  | Application Business Rules: Use Cases     |  |  |
       |  |  |  +-------------------------------------+  |  |  |
       |  |  |  | Enterprise Business Rules: Domain   |  |  |  |
       |  |  |  +-------------------------------------+  |  |  |
       |  |  +-------------------------------------------+  |  |
       |  +-------------------------------------------------+  |
       +-------------------------------------------------------+
```

---

## 2. Standard Project Structure

Every AI agent working on this codebase **must** maintain the following directory layout:

```
.
├── cmd/
│   └── main.go                     # Application entry point; wires bootstrap & starts server
├── bootstrap/
│   ├── app.go                      # Initializes Application context, config, and database clients
│   ├── env.go                      # Environment variable schema & Viper loader
│   └── database.go                 # Database connection client lifecycle (Connect, Ping, Close)
├── domain/                         # ENTERPRISE BUSINESS RULES & CONTRACTS
│   ├── user.go                     # Entity structs, Repository interfaces, Usecase interfaces
│   ├── task.go                     # Domain entity, Mongo collection name, CRUD interfaces
│   ├── jwt_custom.go               # JWT claims and token contracts
│   ├── error_response.go           # Standard error response DTO
│   ├── success_response.go         # Standard success response DTO
│   └── mocks/                      # Auto-generated mock files (via mockery) for testing
├── usecase/                        # APPLICATION BUSINESS RULES
│   ├── user_usecase.go             # Coordinates domain operations & timeouts
│   ├── task_usecase.go             # Implements domain.TaskUsecase interface
│   └── task_usecase_test.go        # Unit tests verifying business logic via mocks
├── repository/                     # DATA ACCESS IMPLEMENTATION (INTERFACE ADAPTERS)
│   ├── task_repository.go          # Implements domain.TaskRepository against DB abstraction
│   ├── user_repository.go          # Implements domain.UserRepository
│   └── user_repository_test.go     # Repository unit/integration tests
├── api/                            # DELIVERY MECHANISM / HTTP INTERFACE ADAPTERS
│   ├── controller/
│   │   ├── task_controller.go      # Gin HTTP request binder, validator, and response handler
│   │   └── task_controller_test.go # HTTP unit tests using net/http/httptest
│   ├── middleware/
│   │   └── jwt_auth_middleware.go  # Authentication, rate limiting, and request context injection
│   └── route/
│       ├── route.go                # Central router setup (registers public and protected subrouters)
│       └── task_route.go           # Dependency injection wiring for task endpoint
├── internal/                       # PRIVATE UTILITIES (Non-exportable outside module)
│   └── tokenutil/
│       └── tokenutil.go            # JWT creation, verification, and extraction helpers
├── mongo/                          # DATABASE DRIVER ABSTRACTION INTERFACES
│   ├── mongo.go                    # Database, Collection, SingleResult, and Cursor interfaces
│   └── mocks/                      # Mock drivers for database testing
├── Dockerfile                      # Multi-stage production container build
├── docker-compose.yaml             # Local service orchestration (App + Database)
├── .env.example                    # Environment template
├── go.mod
└── go.sum
```

---

## 3. Layer Separation & Responsibilities Matrix

| Layer | Directory | Responsibilities | Permitted Imports | Strictly Forbidden Imports |
| :--- | :--- | :--- | :--- | :--- |
| **Domain** | `domain/` | Entity structs, BSON/JSON tags, Repository & Usecase interface declarations, standard DTOs. | `context`, standard library primitives (`time`, etc.), BSON primitives if strictly necessary. | `gin`, `mongo`, `repository`, `usecase`, `api`, `bootstrap`. |
| **Use Case** | `usecase/` | Pure business workflows, timeout context creation, transaction coordination, validation logic. | `domain`, `context`, `time`, standard library. | `gin`, `api/*`, `mongo`, `repository` concrete structs. |
| **Repository** | `repository/` | DB queries, data serialization/deserialization, database adapter mapping. | `domain`, `mongo` interface package, driver BSON utilities. | `api/*`, `usecase`, `gin`. |
| **Controller** | `api/controller/`| Parsing HTTP inputs (`ShouldBind`), validating request schema, calling usecases, crafting HTTP responses. | `domain`, `gin`, `net/http`. | `repository`, direct DB drivers (`mongo`). |
| **Router** | `api/route/` | Dependency Injection container. Instantiates repositories, usecases, controllers, and binds routes. | `domain`, `repository`, `usecase`, `api/controller`, `api/middleware`, `bootstrap`, `gin`. | Business logic or DB queries. |
| **Bootstrap** | `bootstrap/` | Config parsing (`viper`), connection pools, logger initialization, app lifecycle. | `mongo`, `viper`, standard library. | `domain` business logic, `api/*`. |

---

## 4. Architectural Rules for AI Agents (Invariants)

### 4.1 The Golden Rules of Clean Architecture
1. **Never pass `*gin.Context` down to usecases or repositories.**  
   Always extract standard `context.Context` (e.g., `c.Request.Context()` or `c`) and pass `context.Context` down the call stack.
2. **Controllers are thin adapters.**  
   Controllers must NOT perform database queries, heavy algorithmic computation, or password hashing. They only deserialize input, call the usecase, and serialize output.
3. **Use Cases depend only on Interfaces.**  
   A usecase struct must store domain interfaces (e.g., `domain.TaskRepository`), never concrete struct pointers (e.g., `*repository.taskRepository`).
4. **Context Timeout is managed at the Usecase Layer.**  
   Usecases derive timeout contexts using `context.WithTimeout(ctx, timeout)` and ensure `defer cancel()` is called to prevent goroutine context leaks.
5. **No Direct Driver Leakage in Domain.**  
   Keep database driver dependencies isolated behind the `mongo/` abstraction layer or within `repository/`. The domain models should only use standard Go types or agnostic ID representations.

---

## 5. End-to-End Implementation Blueprint: Adding a New Feature

When an AI Agent is tasked with creating a new feature (e.g., `Item`), execute the following 6 steps in strict sequential order.

### Step 1: Define Domain Entity & Contracts (`domain/item.go`)
Define the entity schema, MongoDB collection name constant, Repository interface, and Usecase interface in a single domain file:

```go
package domain

import (
	"context"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	CollectionItem = "items"
)

type Item struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Title       string             `bson:"title" json:"title" form:"title" binding:"required"`
	Description string             `bson:"description" json:"description" form:"description"`
	UserID      primitive.ObjectID `bson:"userID" json:"-"`
}

type ItemRepository interface {
	Create(c context.Context, item *Item) error
	FetchByUserID(c context.Context, userID string) ([]Item, error)
	GetByID(c context.Context, id string) (*Item, error)
}

type ItemUsecase interface {
	Create(c context.Context, item *Item) error
	FetchByUserID(c context.Context, userID string) ([]Item, error)
	GetByID(c context.Context, id string) (*Item, error)
}
```

### Step 2: Implement the Repository (`repository/item_repository.go`)
Implement the interface against the abstracted database interface (`mongo.Database`):

```go
package repository

import (
	"context"

	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/mongo"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type itemRepository struct {
	database   mongo.Database
	collection string
}

func NewItemRepository(db mongo.Database, collection string) domain.ItemRepository {
	return &itemRepository{
		database:   db,
		collection: collection,
	}
}

func (r *itemRepository) Create(c context.Context, item *domain.Item) error {
	collection := r.database.Collection(r.collection)
	_, err := collection.InsertOne(c, item)
	return err
}

func (r *itemRepository) FetchByUserID(c context.Context, userID string) ([]domain.Item, error) {
	collection := r.database.Collection(r.collection)
	var items []domain.Item

	idHex, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return items, err
	}

	cursor, err := collection.Find(c, bson.M{"userID": idHex})
	if err != nil {
		return nil, err
	}

	err = cursor.All(c, &items)
	if items == nil {
		return []domain.Item{}, err
	}
	return items, err
}

func (r *itemRepository) GetByID(c context.Context, id string) (*domain.Item, error) {
	collection := r.database.Collection(r.collection)
	var item domain.Item

	idHex, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, err
	}

	err = collection.FindOne(c, bson.M{"_id": idHex}).Decode(&item)
	return &item, err
}
```

### Step 3: Implement the Use Case (`usecase/item_usecase.go`)
Wrap calls with timeout management and business validation:

```go
package usecase

import (
	"context"
	"time"

	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain"
)

type itemUsecase struct {
	itemRepository domain.ItemRepository
	contextTimeout time.Duration
}

func NewItemUsecase(repo domain.ItemRepository, timeout time.Duration) domain.ItemUsecase {
	return &itemUsecase{
		itemRepository: repo,
		contextTimeout: timeout,
	}
}

func (u *itemUsecase) Create(c context.Context, item *domain.Item) error {
	ctx, cancel := context.WithTimeout(c, u.contextTimeout)
	defer cancel()
	return u.itemRepository.Create(ctx, item)
}

func (u *itemUsecase) FetchByUserID(c context.Context, userID string) ([]domain.Item, error) {
	ctx, cancel := context.WithTimeout(c, u.contextTimeout)
	defer cancel()
	return u.itemRepository.FetchByUserID(ctx, userID)
}

func (u *itemUsecase) GetByID(c context.Context, id string) (*domain.Item, error) {
	ctx, cancel := context.WithTimeout(c, u.contextTimeout)
	defer cancel()
	return u.itemRepository.GetByID(ctx, id)
}
```

### Step 4: Implement Controller (`api/controller/item_controller.go`)
Handles HTTP validation and maps outputs to standard response schemas:

```go
package controller

import (
	"net/http"

	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ItemController struct {
	ItemUsecase domain.ItemUsecase
}

func (tc *ItemController) Create(c *gin.Context) {
	var item domain.Item

	if err := c.ShouldBind(&item); err != nil {
		c.JSON(http.StatusBadRequest, domain.ErrorResponse{Message: err.Error()})
		return
	}

	userID := c.GetString("x-user-id")
	userObjectID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, domain.ErrorResponse{Message: "Invalid User ID"})
		return
	}

	item.ID = primitive.NewObjectID()
	item.UserID = userObjectID

	if err := tc.ItemUsecase.Create(c, &item); err != nil {
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}

	c.JSON(http.StatusCreated, domain.SuccessResponse{
		Message: "Item created successfully",
	})
}

func (tc *ItemController) Fetch(c *gin.Context) {
	userID := c.GetString("x-user-id")

	items, err := tc.ItemUsecase.FetchByUserID(c, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, domain.ErrorResponse{Message: err.Error()})
		return
	}

	c.JSON(http.StatusOK, items)
}
```

### Step 5: Wire Dependency Injection in Routes (`api/route/item_route.go`)
Construct the dependency tree and register endpoints:

```go
package route

import (
	"time"

	"github.com/amitshekhariitbhu/go-backend-clean-architecture/api/controller"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/bootstrap"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/mongo"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/repository"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/usecase"
	"github.com/gin-gonic/gin"
)

func NewItemRouter(env *bootstrap.Env, timeout time.Duration, db mongo.Database, group *gin.RouterGroup) {
	repo := repository.NewItemRepository(db, domain.CollectionItem)
	ctrl := &controller.ItemController{
		ItemUsecase: usecase.NewItemUsecase(repo, timeout),
	}

	group.POST("/item", ctrl.Create)
	group.GET("/item", ctrl.Fetch)
}
```

Register this subrouter in `api/route/route.go`:
```go
// Inside Setup(env, timeout, db, gin):
protectedRouter.Use(middleware.JwtAuthMiddleware(env.AccessTokenSecret))
NewItemRouter(env, timeout, db, protectedRouter)
```

---

## 6. Testing, Mocking, and Verification Patterns

### 6.1 Testing Strategy: Integration Tests First & Minimal Mocking
In strict adherence to [AGENTS.md](file:///mnt/Projects/android-browser-stream/AGENTS.md):
- **Integration tests first**: Test real behavior with real dependencies (e.g. ephemeral MongoDB or containerized instances) for data access and HTTP workflows.
- **Minimal mocking**: Use mocks selectively—primarily when isolating complex domain business workflows from external network or third-party boundaries.
- **Test behavior, not implementation**: Focus assertions on state and domain results rather than brittle verification of internal call orders.

### 6.2 Mock Generation with Mockery
When unit testing pure use case logic in isolation, never hand-write mocks. Generate mocks for domain interfaces using `mockery`:

```bash
# Generate mocks for domain interfaces
mockery --dir=domain --output=domain/mocks --outpkg=mocks --all

# Generate mocks for database abstraction
mockery --dir=mongo --output=mongo/mocks --outpkg=mocks --all
```

### 6.3 Unit Testing Use Cases (`usecase/*_test.go`)
Test business logic in total isolation from the database driver:

```go
package usecase_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain/mocks"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/usecase"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestFetchByUserID(t *testing.T) {
	mockRepo := new(mocks.ItemRepository)
	userHex := primitive.NewObjectID().Hex()

	t.Run("success", func(t *testing.T) {
		mockItems := []domain.Item{
			{Title: "Item 1"},
			{Title: "Item 2"},
		}

		mockRepo.On("FetchByUserID", mock.Anything, userHex).Return(mockItems, nil).Once()

		u := usecase.NewItemUsecase(mockRepo, 2*time.Second)
		result, err := u.FetchByUserID(context.Background(), userHex)

		assert.NoError(t, err)
		assert.Equal(t, 2, len(result))
		mockRepo.AssertExpectations(t)
	})

	t.Run("database error", func(t *testing.T) {
		mockRepo.On("FetchByUserID", mock.Anything, userHex).Return(nil, errors.New("db error")).Once()

		u := usecase.NewItemUsecase(mockRepo, 2*time.Second)
		result, err := u.FetchByUserID(context.Background(), userHex)

		assert.Error(t, err)
		assert.Nil(t, result)
		mockRepo.AssertExpectations(t)
	})
}
```

### 6.4 Unit Testing Controllers (`api/controller/*_test.go`)
Use `httptest.ResponseRecorder` and mock usecases:

```go
package controller_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/amitshekhariitbhu/go-backend-clean-architecture/api/controller"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain"
	"github.com/amitshekhariitbhu/go-backend-clean-architecture/domain/mocks"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestFetchItemController(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("success", func(t *testing.T) {
		mockUsecase := new(mocks.ItemUsecase)
		items := []domain.Item{{Title: "Test"}}

		mockUsecase.On("FetchByUserID", mock.Anything, "user123").Return(items, nil)

		r := gin.Default()
		r.Use(func(c *gin.Context) {
			c.Set("x-user-id", "user123")
			c.Next()
		})

		ctrl := &controller.ItemController{ItemUsecase: mockUsecase}
		r.GET("/item", ctrl.Fetch)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest(http.MethodGet, "/item", nil)
		r.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		var resp []domain.Item
		json.Unmarshal(w.Body.Bytes(), &resp)
		assert.Equal(t, 1, len(resp))
	})
}
```

---

## 7. Error Handling, Validation, and Standard DTOs

### 7.1 Response Schemas
Never return arbitrary or unstructured JSON strings. Adhere to standardized DTOs defined in `domain/`:

- **Error Response (`domain/error_response.go`):**
  ```go
  type ErrorResponse struct {
      Message string `json:"message"`
  }
  ```
- **Success Response (`domain/success_response.go`):**
  ```go
  type SuccessResponse struct {
      Message string `json:"message"`
  }
  ```

### 7.2 Controller Error Mapping Matrix
| Error Scenario | HTTP Status Code | Response Payload |
| :--- | :--- | :--- |
| Invalid JSON / Form payload (`c.ShouldBind`) | `http.StatusBadRequest` (400) | `ErrorResponse{Message: err.Error()}` |
| Missing / Invalid ObjectID Hex | `http.StatusBadRequest` (400) | `ErrorResponse{Message: "Invalid ID"}` |
| Missing or invalid JWT Authorization header | `http.StatusUnauthorized` (401) | `ErrorResponse{Message: "Not authorized"}` |
| Expired / Invalid token | `http.StatusUnauthorized` (401) | `ErrorResponse{Message: err.Error()}` |
| Resource not found | `http.StatusNotFound` (404) | `ErrorResponse{Message: "Resource not found"}` |
| Database / Internal server failure | `http.StatusInternalServerError` (500) | `ErrorResponse{Message: err.Error()}` |

---

## 8. Database Driver Abstraction Pattern

The official `mongo-driver` concrete structs cannot be directly mocked for unit tests. To solve this, wrap database constructs inside the `mongo/` package:

```go
// mongo/mongo.go abstraction contracts
type Database interface {
    Collection(string) Collection
    Client() Client
}

type Collection interface {
    FindOne(context.Context, interface{}) SingleResult
    InsertOne(context.Context, interface{}) (interface{}, error)
    InsertMany(context.Context, []interface{}) ([]interface{}, error)
    DeleteOne(context.Context, interface{}) (int64, error)
    Find(context.Context, interface{}, ...*options.FindOptions) (Cursor, error)
    CountDocuments(context.Context, interface{}, ...*options.CountOptions) (int64, error)
    Aggregate(context.Context, interface{}) (Cursor, error)
    UpdateOne(context.Context, interface{}, interface{}, ...*options.UpdateOptions) (*mongo.UpdateResult, error)
    UpdateMany(context.Context, interface{}, interface{}, ...*options.UpdateOptions) (*mongo.UpdateResult, error)
}
```

> **Guideline:** If adding a new query capability (e.g., bulk writes or transactions), **first update the `mongo.Collection` interface** in `mongo/mongo.go` and delegate to the underlying mongo driver in `mongoCollection`. Then regenerate `mongo/mocks`.

---

## 9. Configuration & Application Lifecycle

### 9.1 Environment Configuration (`bootstrap/env.go`)
- All application configuration is centralized into a typed struct `Env`.
- Uses `github.com/spf13/viper` to unmarshal from `.env` or system environment variables.
- Fields must use the `mapstructure` tag matching uppercase `.env` keys.

```go
type Env struct {
    AppEnv                 string `mapstructure:"APP_ENV"`
    ServerAddress          string `mapstructure:"SERVER_ADDRESS"`
    ContextTimeout         int    `mapstructure:"CONTEXT_TIMEOUT"`
    DBHost                 string `mapstructure:"DB_HOST"`
    DBPort                 string `mapstructure:"DB_PORT"`
    DBUser                 string `mapstructure:"DB_USER"`
    DBPass                 string `mapstructure:"DB_PASS"`
    DBName                 string `mapstructure:"DB_NAME"`
    AccessTokenExpiryHour  int    `mapstructure:"ACCESS_TOKEN_EXPIRY_HOUR"`
    RefreshTokenExpiryHour int    `mapstructure:"REFRESH_TOKEN_EXPIRY_HOUR"`
    AccessTokenSecret      string `mapstructure:"ACCESS_TOKEN_SECRET"`
    RefreshTokenSecret     string `mapstructure:"REFRESH_TOKEN_SECRET"`
}
```

### 9.2 Graceful Shutdown in `cmd/main.go`
For production readiness, ensure database connections and server listeners are terminated cleanly:

```go
func main() {
    app := bootstrap.App()
    env := app.Env
    db := app.Mongo.Database(env.DBName)
    defer app.CloseDBConnection()

    timeout := time.Duration(env.ContextTimeout) * time.Second
    engine := gin.Default()

    route.Setup(env, timeout, db, engine)

    // Run server
    if err := engine.Run(env.ServerAddress); err != nil {
        log.Fatalf("Server forced to shutdown: %v", err)
    }
}
```

---

## 10. Anti-Patterns & Pitfalls to Avoid

| Anti-Pattern | Why It Breaks the Architecture | Correct Approach |
| :--- | :--- | :--- |
| **Passing `*gin.Context` to Usecase** | Tight-couples business rules to the Gin web framework, preventing reuse in gRPC, CLI, or event consumers. | Pass `context.Context` (or `c.Request.Context()`). |
| **Direct DB Calls in Controller** | Bypasses business validation, breaks separation of concerns, prevents mock testing. | Delegate to `domain.Usecase`. |
| **Concrete Repositories in Usecase** | Violates Dependency Inversion; usecases cannot be tested without an active DB. | Depend strictly on `domain.Repository` interface. |
| **Ignoring Context Deadlines** | Goroutines hang indefinitely when network requests or database queries stall. | Wrap queries with `context.WithTimeout`. |
| **Global Database Singletons** | Causes race conditions in tests and destroys concurrency safety. | Explicitly pass `mongo.Database` via constructor functions (`New...`). |
| **Hardcoded Secrets or URLs** | Causes security vulnerabilities and breaks container deployment. | Add field to `bootstrap.Env` and inject through `.env`. |

---

## 11. AI Agent Pre-Commit & Verification Checklist

Before reporting completion on any Go backend task, every AI Agent must perform these validation checks:

- [ ] **Dependency Direction Check:** Does any file in `domain/` or `usecase/` import `api`, `gin`, or concrete `repository`? (Must be NO).
- [ ] **Interface Adherence:** Are all new repositories and usecases bound to domain interfaces in `domain/*.go`?
- [ ] **Context Propagation:** Is `context.Context` passed down from Controller $\to$ Usecase $\to$ Repository $\to$ Database?
- [ ] **Timeout Management:** Does the usecase wrap the context with `context.WithTimeout` and `defer cancel()`?
- [ ] **Mock Generation:** Did you update or generate mocks for altered interfaces? (`mockery --all`)
- [ ] **Test Execution:** Do all unit tests pass cleanly?
  ```bash
  go test -v -race ./...
  ```
- [ ] **Linter & Formatting:** Is the code properly formatted?
  ```bash
  go fmt ./...
  go vet ./...
  ```
- [ ] **Response Consistency:** Are HTTP errors formatted with `domain.ErrorResponse` and successes with `domain.SuccessResponse` or typed DTOs?
