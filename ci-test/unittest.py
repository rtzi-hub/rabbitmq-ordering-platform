#!/usr/bin/env python3
import os
import sys
import py_compile
from pathlib import Path


def check_python_syntax(root_dir='.'):
    """
    Recursively check all Python files for syntax errors.

    Args:
        root_dir: Root directory to search for Python files (default: current directory)

    Returns:
        bool: True if all files pass, False otherwise
    """
    errors = []
    root_path = Path(root_dir).resolve()

    # Find all Python files
    python_files = list(root_path.rglob('*.py'))

    if not python_files:
        print("No Python files found in the project.")
        return True

    print(f"Found {len(python_files)} Python file(s) to check...\n")

    for py_file in python_files:
        # Skip files in .git, __pycache__, and other common ignore directories
        if any(ignore in str(py_file) for ignore in ['.git', '__pycache__', '.venv', 'venv', 'node_modules']):
            continue

        try:
            # Compile the file to check for syntax errors
            py_compile.compile(str(py_file), doraise=True)
            print(f" {py_file.relative_to(root_path)}")
        except py_compile.PyCompileError as e:
            error_msg = f" {py_file.relative_to(root_path)}: {e.msg}"
            print(error_msg)
            errors.append((py_file, str(e)))
        except Exception as e:
            error_msg = f" {py_file.relative_to(root_path)}: {str(e)}"
            print(error_msg)
            errors.append((py_file, str(e)))

    print(f"\n{'='*60}")
    if errors:
        print(f" FAILED: {len(errors)} file(s) have syntax errors:")
        for file_path, error in errors:
            print(f"  - {file_path}: {error}")
        return False
    else:
        print(f" SUCCESS: All {len(python_files)} Python file(s) passed syntax check!")
        return True


if __name__ == '__main__':
    # Get root directory from command line argument or use current directory
    root = sys.argv[1] if len(sys.argv) > 1 else '.'

    success = check_python_syntax(root)
    sys.exit(0 if success else 1)

