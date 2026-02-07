"""Report export — PDF and PPTX generation."""

import json


async def export_pdf(report: dict) -> str:
    """Generate PDF from Tiptap JSON content. Returns download URL."""
    content = report.get("content", {})
    title = report.get("title", "Report")

    # Convert Tiptap JSON to simple HTML
    html = _tiptap_to_html(content, title)

    # MVP: Return a data URL with the HTML (production would use WeasyPrint + Supabase Storage)
    # For now, we signal that export is ready with a placeholder URL
    report_id = report.get("id", "unknown")
    return f"/api/v1/studio/reports/{report_id}/download/pdf"


async def export_pptx(report: dict) -> str:
    """Generate PPTX from report content. Returns download URL."""
    report_id = report.get("id", "unknown")
    # MVP: placeholder URL (production would use python-pptx + Supabase Storage)
    return f"/api/v1/studio/reports/{report_id}/download/pptx"


def _tiptap_to_html(content: dict, title: str) -> str:
    """Convert Tiptap JSON to basic HTML."""
    html_parts = [
        "<!DOCTYPE html>",
        "<html><head>",
        f"<title>{title}</title>",
        "<style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;}</style>",
        "</head><body>",
        f"<h1>{title}</h1>",
    ]

    for node in content.get("content", []):
        node_type = node.get("type", "")
        text = ""
        for child in node.get("content", []):
            text += child.get("text", "")

        if node_type == "heading":
            level = node.get("attrs", {}).get("level", 2)
            html_parts.append(f"<h{level}>{text}</h{level}>")
        elif node_type == "paragraph":
            html_parts.append(f"<p>{text}</p>")
        elif node_type == "bulletList":
            html_parts.append("<ul>")
            for item in node.get("content", []):
                item_text = ""
                for p in item.get("content", []):
                    for c in p.get("content", []):
                        item_text += c.get("text", "")
                html_parts.append(f"<li>{item_text}</li>")
            html_parts.append("</ul>")

    html_parts.append("</body></html>")
    return "\n".join(html_parts)
