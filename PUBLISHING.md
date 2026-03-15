# Publishing to PyPI

## Prerequisites

1. Create an account at [pypi.org](https://pypi.org/account/register/)
2. Create an API token at [pypi.org/manage/account/token/](https://pypi.org/manage/account/token/)
3. Install build tools:

```bash
pip install build twine
```

## Steps

1. **Update version** in `pyproject.toml` and `aicommit_checker/__init__.py`

2. **Build the package:**
   ```bash
   python -m build
   ```

3. **Upload to PyPI:**
   ```bash
   twine upload dist/*
   ```
   Use your PyPI username and the API token as password.

4. **Test with TestPyPI first** (optional but recommended):
   ```bash
   twine upload --repository testpypi dist/*
   ```
   Then test install: `pip install -i https://test.pypi.org/simple/ commitguard`

## Notes

- Package name `commitguard` must be unique on PyPI
- Repository: https://github.com/PierrunoYT/commitguard
