# AI Contribution Policy

This project **allows all types of contribution to be made with the assistance of AI tools**.

For example, you may use an agent to generate code, documentation, issues, and other such content. As long as the contribution follows the project's [contribution guidelines](https://github.com/wolfstar-project/.github/blob/main/.github/CONTRIBUTING.md), it is welcome whether it was created by a human or an agent.

## Summary

- AI may be used when contributing
- You must understand every change you submit
- AI usage does not need to be declared, but disclosing it is appreciated
- Contribution guidelines must still be followed
- Abuse, such as spam, scams, or malicious content, is not allowed

## Understanding your changes

You are responsible for everything you submit, however it was produced. Review and test your changes before you open a pull request, and be ready to explain and revise them during review.

Maintainers may close a pull request, or rework it themselves, when its author does not understand the changes it makes.

Keep commit messages and pull request descriptions short, and say why the change is needed. A generated list of every line that changed does not help a reviewer: trim it to the intent of the change.

## Disclosure

Declaring AI usage is not required. As a common courtesy, when an AI tool wrote or edited the code or the pull request description, end the pull request body with a disclosure line:

```md
> 🤖 AI disclosure: <agent or tool name> was used on this PR. Code written with <model id>; PR description written with <model id>. [AI policy](https://github.com/wolfstar-project/wolfstar/blob/main/AI_POLICY.md).
```

- Use the exact model ids that were used, never a guess. If the code and the description came from different models or tools, name each one.
- Never remove a disclosure line another contributor left.

## Secrets and private data

Do not paste secrets, tokens, `.env` files, private user data, or unreported security vulnerabilities into third-party AI services. Report vulnerabilities privately to the maintainers, not through an AI service or a public issue.

## Spam and abuse

Opening pull requests, issues, or comments in bulk with automated tools, without reviewing them first, costs reviewers far more time than it took to produce them. We treat it as spam: such contributions are closed, and accounts that keep doing it may be blocked.

This policy is based on the [AI Allowed policy, version 1.0.0](https://ai-policy.dev/policies/ai-allowed/1.0.0) from 2026-09-20, adapted for the WolfStar Project. Read more about this and other AI contribution policies on [ai-policy.dev](https://ai-policy.dev/).
