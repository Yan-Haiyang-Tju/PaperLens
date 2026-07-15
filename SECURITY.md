# Security Policy

Please report vulnerabilities privately through GitHub Security Advisories for this repository. Do not open a public issue containing credentials, local paths, private paper text, or a working exploit.

PaperLens stores provider API keys in the operating system credential store. The renderer never receives the complete key. AI requests are initiated only by an explicit user action and show an exact context preview before first use. Export archives exclude API keys and PDF files.
