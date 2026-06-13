# AI Agent Guild: Scoring 95+ on Hack2Skill / PromptWars Evaluations

This guide is designed for AI coding agents to ensure that any project built on Hack2Skill or similar automated evaluation platforms scores **95+ across all grading rubrics**.

---

## 1\. 🛡️ Security Checklists (Target: 95+)

*Automated evaluators scan for data leaks, insecure input handling, and missing server headers.*

- **Never Keep Keys Client-Side**: Do not store tokens, passwords, or API keys in `localStorage`, `sessionStorage`, or hardcoded variables. Provide a Node.js/Express server and use `.env` files.

- **Strict Input Validation**: Validate all body parameters, query arguments, and headers on the backend.

    - Install and use `zod` or `joi`.

    - Example validator:

        ```javascript
        const { z } = require('zod');
        const inputSchema = z.object({
          schedule: z.string().min(5).max(500),
          servings: z.number().int().min(1).max(10)
        });
        ```

- **Implement Security Headers**: Install and configure `helmet` to block common script injections, clickjacking, and mime sniffing.

    ```javascript
    const helmet = require('helmet');
    app.use(helmet());
    ```

- **Rate Limiting**: Prevent automated abuse of API endpoints.

    ```javascript
    const rateLimit = require('express-rate-limit');
    const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
    app.use('/api/', limiter);
    ```

- **XSS & Output Sanitization**: Sanitize dynamic HTML rendering on the client side using `DOMPurify` to ensure user-supplied data cannot run raw JS.

---

## 2\. 🧪 Automated Testing (Target: 95+)

*Evaluators look at test coverage percentage. A 0% score in tests drags the average down drastically.*

- **Always Include a Test Suite**: Even if the user doesn't ask, write unit tests for the core utility functions and routes.

- **Jest Setup**:

    - Install Jest (`npm install --save-dev jest supertest`).

    - Create a `/tests` directory.

    - Write a simple server validation test:

        ```javascript
        const request = require('supertest');
        const app = require('../server'); // Export app from server.js

        describe('GET / Health Check', () => {
          it('should return static assets or health message', async () => {
            const res = await request(app).get('/');
            expect(res.statusCode).toEqual(200);
          });
        });
        ```

- **Configure test runners**: Add `"test": "jest"` to the `scripts` in `package.json`.

---

## 3\. ♿ Accessibility & A11y (Target: 95+)

*Scanners use tools like Axe Core to run audit trails over the rendered HTML.*

- **Keyboard Focusability**: All custom buttons, dialog close buttons, and tab controls MUST be reachable via keyboard `Tab` and triggers (`Enter`/`Space`).

- **Semantic HTML5 Elements**: Avoid using `div` elements for everything. Use `&lt;header&gt;`, `&lt;main&gt;`, `&lt;nav&gt;`, `&lt;aside&gt;`, `&lt;section&gt;`, and `&lt;button&gt;`.

- **Screen Reader Support (ARIA)**:

    - Provide `aria-label` or `aria-labelledby` for buttons containing only icons or emoji.

    - Use `aria-live="polite"` on dynamically updated status dashboards (e.g., budget alerts, cooking progress).

- **Color Contrast**: Match WCAG AA/AAA guidelines. Avoid grey text on light backgrounds or low-luminance yellow text.

---

## 4\. 📐 Code Quality & Structure (Target: 95+)

*Code scanners evaluate design patterns, redundancy, and style conformity.*

- **TypeScript (Recommended)**: Use TypeScript instead of Vanilla JavaScript when possible to prevent runtime errors and verify type-checks.

- **Linting Rules**: Include `.eslintrc.json` and `.prettierrc` configuration files.

- **Modular Services**: Separate HTTP routing from business logic. Keep handlers clean:

    - `controllers/` for routing.

    - `services/` for API requests and integrations.

    - `utils/` for stateless helpers.

---

## 5\. ⚡ Performance & Efficiency (Target: 95+)

*Scanners monitor bundle sizes, load speeds, and memory consumption.*

- **Minify Assets**: Avoid importing massive utility packages (e.g., full lodash). Use small, single-purpose functions.

- **Lazy Loading**: Lazy-load heavy components, images, or assets.

- **Static Assets Compression**: Use webp instead of raw png/jpg. Compile CSS clean and structured without excessive nested rules.

