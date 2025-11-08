# Contributing to Domestika Downloader

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

**Related Documentation:**
- [README.md](README.md) - Project overview, installation, and usage instructions
- [FUTURE.md](FUTURE.md) - Potential future enhancements and features

## Getting Started

### Prerequisites

- Node.js 20 or higher
- npm
- Git
- ffmpeg (see README.md for installation instructions)
- N_m3u8DL-RE binary (see README.md)

### Local Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/domestika-downloader-V2.git
   cd domestika-downloader-V2
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Set up Husky (git hooks):
   ```bash
   npm run prepare
   ```
5. Create `.env` file:
   ```bash
   cp .env.example .env
   ```
   Then add your Domestika cookies to `.env` (see README.md for instructions)

6. Build the project:
   ```bash
   npm run build
   ```

7. Run the project:
   ```bash
   npm start
   ```

## Development Workflow

### 1. Create a Branch

Create a new branch for your changes:
```bash
git checkout -b feat/your-feature-name
```

### 2. Make Your Changes

- Write clean, maintainable code
- Follow the existing code style
- Add comments for complex logic
- Keep functions focused and small

### 3. Code Style

We use [BiomeJS](https://biomejs.dev/) for linting and formatting.

**Before committing:**
```bash
# Check for linting and formatting issues
npm run check

# Auto-fix issues
npm run check:fix
```

**Key style guidelines:**
- Use 2 spaces for indentation (tabs in config, spaces in code)
- Use single quotes for strings
- Always use semicolons
- Follow TypeScript strict mode rules
- Keep line width under 100 characters

### 4. Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system changes
- `ci`: CI/CD changes
- `chore`: Other changes (dependencies, etc.)
- `revert`: Revert a previous commit

**Examples:**
```bash
feat: add support for multiple subtitle languages
fix: resolve issue with course URL parsing
docs: update installation instructions
refactor: simplify video download logic
```

**Important:** Commit messages are validated by Husky hooks. Invalid commit messages will be rejected.

### 5. Add a Changeset

**⚠️ REQUIRED:** Every PR must include a changeset file.

1. Create a changeset:
   ```bash
   npm run changeset
   ```
2. Follow the prompts:
   - Select the type of change (patch, minor, or major)
   - Write a summary of your changes
3. Commit the changeset file:
   ```bash
   git add .changeset/
   git commit -m "feat: your feature description"
   ```

**Changeset types:**
- **patch**: Bug fixes, small improvements (e.g., `fix: resolve download error`)
- **minor**: New features, enhancements (e.g., `feat: add subtitle language selection`)
- **major**: Breaking changes (e.g., `feat!: change API structure`)

See [.changeset/README.md](.changeset/README.md) for more details.

### 6. Testing

Before submitting your PR:

1. **Type check:**
   ```bash
   npx tsc --noEmit
   ```

2. **Lint and format:**
   ```bash
   npm run check
   ```

3. **Build:**
   ```bash
   npm run build
   ```

4. **Test manually** (if applicable):
   - Test your changes with real course URLs
   - Verify error handling
   - Check edge cases

### 7. Submit a Pull Request

1. Push your branch:
   ```bash
   git push origin feat/your-feature-name
   ```

2. Create a PR on GitHub:
   - Use a descriptive title
   - Fill out the PR template completely
   - Link any related issues
   - Ensure the PR includes a changeset

3. **PR Requirements:**
   - ✅ All CI checks must pass
   - ✅ Changeset file must be included
   - ✅ Code must be formatted and linted
   - ✅ Commit messages must follow conventional commits
   - ✅ PR description must be complete

## Code Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, your PR will be merged
4. After merge, a release will be automatically created (if changeset is present)

## Release Process

Releases are fully automated! Here's how it works:

### Automatic Release Generation

When a PR with changesets is merged to `main`, the release workflow automatically:

1. **Bumps the version** based on changesets (patch/minor/major)
2. **Generates CHANGELOG.md** using conventional-changelog
3. **Creates release notes** from your conventional commits, grouped by type:
   - ✨ Features (`feat:`)
   - 🐛 Bug Fixes (`fix:`)
   - ⚡ Performance Improvements (`perf:`)
   - ♻️ Code Refactoring (`refactor:`)
   - 📚 Documentation (`docs:`)
   - 🔧 Chores (`chore:`)
4. **Creates a GitHub release** with comprehensive release notes
5. **Commits and pushes** the version bump and changelog

### Best Practices for Releases

1. **Write clear commit messages** - They become your release notes!
2. **Use appropriate commit types** - This groups changes logically
3. **Add changesets** - Required for version bumping
4. **Keep commits atomic** - One logical change per commit


## Debugging Tips

### Enable Debug Mode

Set `DEBUG=true` in your `.env` file to see detailed logs:
- Memory usage statistics
- Subtitle download/embedding details
- File operations
- Download queue progress

### Testing Your Changes

1. Build the project: `npm run build`
2. Type check: `npx tsc --noEmit`
3. Lint: `npm run check`
4. Test manually with a real course URL

Thank you for contributing! 🎉

