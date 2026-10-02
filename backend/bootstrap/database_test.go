package bootstrap_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/user/android-browser-stream/backend/bootstrap"
)

func TestNewSQLiteDatabase_CreatesNestedDirectory(t *testing.T) {
	tempDir := t.TempDir()
	nestedDBPath := filepath.Join(tempDir, "nested", "subfolder", "test.db")

	env := bootstrap.NewEnv()
	env.DBPath = nestedDBPath

	db, err := bootstrap.NewSQLiteDatabase(env)
	require.NoError(t, err)
	defer db.Close()

	// Verify file was created in the nested directory
	_, err = os.Stat(nestedDBPath)
	assert.NoError(t, err)
}
