/**
 * Turn the official invoice HTML (same as on-screen preview) into a downloadable PDF.
 */
export async function downloadHtmlAsPdf(html: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:210mm;min-height:297mm;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      iframe.onload = () => finish();
      iframe.srcdoc = html;
      window.setTimeout(finish, 700);
    });

    const doc = iframe.contentDocument;
    if (!doc?.body) throw new Error('Could not render the invoice for PDF.');
    const sheet = (doc.querySelector('.sheet') as HTMLElement | null) || doc.body;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: Math.max(sheet.scrollWidth, 794),
      windowHeight: Math.max(sheet.scrollHeight, 1123),
    });

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 2) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const name = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(name);
  } finally {
    iframe.remove();
  }
}
