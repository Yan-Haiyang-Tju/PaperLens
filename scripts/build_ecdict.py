#!/usr/bin/env python3
"""Build PaperLens' compact, read-only ECDICT resource.

The builder uses only Python's standard library. It intentionally keeps English
headwords that can be selected as one token in a PDF and stores only fields the
reader displays. This removes examples, frequency metadata and phrases while
retaining the broad single-word vocabulary and ECDICT's irregular forms.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import re
import sqlite3
from pathlib import Path


HEADWORD = re.compile(r"[A-Za-z][A-Za-z'.-]{0,63}")
FORM_CODES = {"p", "d", "i", "3", "r", "t", "s"}
SOURCE_REVISION = "bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b"
SOURCE_SHA256 = "1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf"


def normalize_text(value: str) -> str:
    return value.replace("\\n", "\n").replace("\\r", "").strip()


def forms(exchange: str) -> set[str]:
    result: set[str] = set()
    for group in exchange.split("/"):
        code, separator, values = group.partition(":")
        if not separator or code not in FORM_CODES:
            continue
        for value in values.split(","):
            normalized = value.strip().lower()
            if HEADWORD.fullmatch(normalized):
                result.add(normalized)
    return result


def build(source: Path, destination: Path) -> tuple[int, int]:
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(
            f"Unexpected ECDICT source checksum {digest}; expected {SOURCE_SHA256}. "
            "Review upstream changes before updating the pinned checksum."
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.unlink(missing_ok=True)
    connection = sqlite3.connect(destination)
    connection.executescript(
        """
        PRAGMA page_size=4096;
        PRAGMA journal_mode=OFF;
        PRAGMA synchronous=OFF;
        PRAGMA temp_store=MEMORY;
        PRAGMA locking_mode=EXCLUSIVE;
        CREATE TABLE entries (
          term TEXT PRIMARY KEY,
          phonetic TEXT,
          translation TEXT NOT NULL,
          pos TEXT
        ) WITHOUT ROWID;
        CREATE TABLE forms (
          form TEXT PRIMARY KEY,
          lemma TEXT NOT NULL
        ) WITHOUT ROWID;
        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;
        """
    )

    entries: list[tuple[str, str | None, str, str | None]] = []
    inflections: list[tuple[str, str]] = []
    entry_count = 0
    form_count = 0
    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            term = (row.get("word") or "").strip().lower()
            translation = normalize_text(row.get("translation") or "")
            if not translation or not HEADWORD.fullmatch(term):
                continue
            phonetic = normalize_text(row.get("phonetic") or "") or None
            pos = normalize_text(row.get("pos") or "") or None
            entries.append((term, phonetic, translation, pos))
            inflections.extend((form, term) for form in forms(row.get("exchange") or "") if form != term)
            if len(entries) >= 10_000:
                connection.executemany("INSERT OR REPLACE INTO entries VALUES(?,?,?,?)", entries)
                connection.executemany("INSERT OR IGNORE INTO forms VALUES(?,?)", inflections)
                entry_count += len(entries)
                form_count += len(inflections)
                entries.clear()
                inflections.clear()

    connection.executemany("INSERT OR REPLACE INTO entries VALUES(?,?,?,?)", entries)
    connection.executemany("INSERT OR IGNORE INTO forms VALUES(?,?)", inflections)
    entry_count += len(entries)
    form_count += len(inflections)
    connection.executemany(
        "INSERT INTO metadata VALUES(?,?)",
        [
            ("name", "ECDICT"),
            ("license", "MIT"),
            ("upstream", "https://github.com/skywind3000/ECDICT"),
            ("revision", SOURCE_REVISION),
            ("source_sha256", SOURCE_SHA256),
        ],
    )
    connection.commit()
    connection.execute("VACUUM")
    actual_entries = connection.execute("SELECT count(*) FROM entries").fetchone()[0]
    actual_forms = connection.execute("SELECT count(*) FROM forms").fetchone()[0]
    connection.close()
    return actual_entries, actual_forms


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Pinned ECDICT ecdict.csv")
    parser.add_argument(
        "destination",
        type=Path,
        nargs="?",
        default=Path("src-tauri/resources/ecdict.sqlite3"),
    )
    arguments = parser.parse_args()
    entry_count, form_count = build(arguments.source, arguments.destination)
    size = arguments.destination.stat().st_size
    print(f"Built {arguments.destination}: {entry_count:,} entries, {form_count:,} forms, {size / 1024 / 1024:.1f} MiB")


if __name__ == "__main__":
    main()
