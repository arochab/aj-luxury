from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "deliverables" / "customer-journey-demo" / "GUIDE-VISUEL-LOT2-AJ-LUXURY.pdf"


def main() -> None:
    reader = PdfReader(str(PDF))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    required = [
        "Supabase n'a pas été utilisé.",
        "Aucun backend transactionnel",
        "VOLONTAIREMENT SIMULÉ",
        "À BRANCHER AVANT LE LIVE",
    ]
    missing = [phrase for phrase in required if phrase not in text]
    if len(reader.pages) != 4:
        raise AssertionError(f"Expected 4 pages, found {len(reader.pages)}")
    if missing:
        raise AssertionError(f"Missing phrases: {missing}")
    print(f"PDF_TEXT_PASS pages={len(reader.pages)} chars={len(text)}")


if __name__ == "__main__":
    main()
