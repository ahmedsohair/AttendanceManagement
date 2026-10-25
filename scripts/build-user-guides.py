"""Build the staff PDFs and portable TeX sources from the Markdown guides."""

from argparse import ArgumentParser
from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
GUIDES = (
    ("INVIGILATOR_GUIDE", "Invigilator Guide", "exampulse-invigilator-guide",
     "exampulse_invigilator_instructions_overleaf"),
    ("COORDINATOR_GUIDE", "Coordinator Guide", "exampulse-coordinator-guide",
     "exampulse_coordinator_instructions_overleaf"),
)
RED = colors.HexColor("#E4002B")
INK = colors.HexColor("#172337")
MUTED = colors.HexColor("#526071")
INLINE = re.compile(r"\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)")


def blocks(text):
    """Small, strict Markdown subset keeps print and editable sources aligned."""
    paragraph = []
    for line in text.splitlines() + [""]:
        if not line.strip() or line.startswith(("#", "- ", "<!--")) or re.match(r"^\d+\. ", line):
            if paragraph:
                yield "p", " ".join(paragraph)
                paragraph = []
            if not line.strip():
                continue
            if line == "<!-- pagebreak -->":
                yield "break", ""
            elif line.startswith("# "):
                yield "title", line[2:]
            elif line.startswith("## "):
                yield "h2", line[3:]
            elif line.startswith("- ") or re.match(r"^\d+\. ", line):
                yield "item", line
            else:
                raise ValueError(f"Unsupported guide syntax: {line}")
        else:
            paragraph.append(line)


def inline(text, latex=False):
    def plain(value):
        if not latex:
            return escape(value)
        replacements = {
            "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
            "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}",
            "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
        }
        return "".join(replacements.get(char, char) for char in value)

    output, cursor = [], 0
    for match in INLINE.finditer(text):
        output.append(plain(text[cursor:match.start()]))
        if match.group(1):
            value = plain(match.group(1))
            output.append(r"\textbf{" + value + "}" if latex else f"<b>{value}</b>")
        else:
            label, url = plain(match.group(2)), plain(match.group(3))
            output.append(r"\href{" + url + "}{" + label + "}" if latex else
                          f'<link href="{url}" color="#B31332">{label}</link>')
        cursor = match.end()
    output.append(plain(text[cursor:]))
    return "".join(output)


def build_pdf(parsed, path, label):
    styles = {
        "title": ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=23,
                                leading=26, textColor=INK, spaceAfter=10),
        "h2": ParagraphStyle("Section", fontName="Helvetica-Bold", fontSize=12.2,
                             leading=15, textColor=RED, spaceBefore=11,
                             spaceAfter=5, keepWithNext=True),
        "p": ParagraphStyle("Body", fontName="Helvetica", fontSize=10.2,
                            leading=14.1, textColor=INK, spaceAfter=7, alignment=TA_LEFT),
        "item": ParagraphStyle("Item", fontName="Helvetica", fontSize=10.2,
                               leading=14.1, textColor=INK, leftIndent=14,
                               firstLineIndent=-14, spaceAfter=5),
    }

    def furniture(canvas, doc):
        width, height = A4
        canvas.saveState()
        canvas.setFillColor(RED)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(18 * mm, height - 16 * mm, "EXAMPULSE")
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(width - 18 * mm, height - 16 * mm, label)
        canvas.setStrokeColor(colors.HexColor("#D9DEE5"))
        canvas.line(18 * mm, 17 * mm, width - 18 * mm, 17 * mm)
        canvas.setFont("Helvetica", 8)
        footer = "25 October 2026  |  exampulse.xyz"
        if label == "Coordinator Guide":
            footer += "  |  Production"
        canvas.drawString(18 * mm, 12 * mm, footer)
        canvas.drawRightString(width - 18 * mm, 12 * mm, f"{doc.page}")
        canvas.restoreState()

    def print_canvas(*args, **kwargs):
        kwargs["invariant"] = 1
        return Canvas(*args, **kwargs)

    flow = []
    for kind, text in parsed:
        if kind == "break":
            flow.append(PageBreak())
        else:
            flow.append(Paragraph(inline(text), styles[kind]))
            if kind == "title":
                flow.extend([HRFlowable(width="100%", thickness=3, color=RED), Spacer(1, 8)])
    path.parent.mkdir(parents=True, exist_ok=True)
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=18 * mm,
                      rightMargin=18 * mm, topMargin=23 * mm, bottomMargin=23 * mm,
                      title=parsed[0][1], author="ExamPulse", pageCompression=1).build(
                          flow, onFirstPage=furniture, onLaterPages=furniture,
                          canvasmaker=print_canvas)


def build_tex(parsed, path, label):
    lines = [
        "% Generated by scripts/build-user-guides.py. Edit the matching Markdown guide.",
        r"\documentclass[10pt,a4paper]{article}",
        r"\usepackage[margin=1.8cm,headheight=14pt]{geometry}",
        r"\usepackage[T1]{fontenc}", r"\usepackage{lmodern}",
        r"\usepackage{xcolor,hyperref,fancyhdr,enumitem,titlesec}",
        r"\definecolor{ExamPulseRed}{HTML}{E4002B}",
        r"\hypersetup{colorlinks=true,urlcolor=ExamPulseRed,linkcolor=ExamPulseRed}",
        r"\pagestyle{fancy}\fancyhf{}\lhead{\textbf{ExamPulse}}\rhead{" + label + "}",
        r"\lfoot{\footnotesize 25 October 2026 | exampulse.xyz}\rfoot{\thepage}",
        r"\setlength{\parindent}{0pt}\setlength{\parskip}{5pt}",
        r"\titleformat{\section}{\large\bfseries\color{ExamPulseRed}}{}{0pt}{}",
        r"\titlespacing*{\section}{0pt}{8pt}{4pt}",
        r"\setlist[itemize]{leftmargin=*,nosep,after=\vspace{4pt}}",
        r"\begin{document}",
    ]
    for kind, text in parsed:
        value = inline(text, latex=True)
        if kind == "title":
            lines.append(r"{\LARGE\bfseries " + value + r"}\par\medskip")
        elif kind == "h2":
            lines.append(r"\section*{" + value + "}")
        elif kind == "break":
            lines.append(r"\newpage")
        elif kind == "item":
            marker, content = text.split(" ", 1)
            bullet = r"\textbullet" if marker == "-" else marker
            lines.append(r"\begin{itemize}\item[" + bullet + "] " +
                         inline(content, latex=True) + r"\end{itemize}")
        else:
            lines.append(value + r"\par")
    lines.append(r"\end{document}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output" / "pdf")
    parser.add_argument("--update-email-attachment", action="store_true",
                        help="Also replace the bundled invigilator PDF for the next deployment.")
    args = parser.parse_args()
    for name, label, filename, texname in GUIDES:
        source = ROOT / "docs" / f"{name}.md"
        parsed = list(blocks(source.read_text(encoding="utf-8")))
        output = args.output_dir / f"{filename}.pdf"
        build_pdf(parsed, output, label)
        build_tex(parsed, ROOT / "docs" / f"{texname}.tex", label)
        print(output)
        if name == "INVIGILATOR_GUIDE" and args.update_email_attachment:
            target = ROOT / "apps/admin/src/lib/assets/exampulse-invigilator-guide.pdf"
            target.write_bytes(output.read_bytes())
            print(f"Email attachment: {target}")


if __name__ == "__main__":
    main()
