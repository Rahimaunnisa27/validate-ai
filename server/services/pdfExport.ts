import PDFDocument from 'pdfkit';
import {
  REPORT_SECTION_META,
  SCORE_LABELS,
  SCORING_DISCLAIMER,
  type ReportClaim,
  type ValidationReportJson,
} from '../../src/shared/reportSchemas.ts';
import type { SimilarIdeaMatch } from './embeddings.ts';
import type { SavedResearchSource } from './research.ts';

export interface PdfReportInput {
  reportId: string;
  ideaTitle: string;
  startupName: string | null;
  planName: string;
  generatedAt: string;
  researchMode: 'sonar' | 'demo' | 'none';
  concepts: string[];
  similarIdeas: SimilarIdeaMatch[];
  sources: SavedResearchSource[];
  reportJson: ValidationReportJson;
}

function formatClaimLine(claim: ReportClaim): string {
  const srcSuffix = claim.sourceId ? ` [${claim.sourceId}]` : '';
  return `• [${claim.evidenceLabel}${srcSuffix}] ${claim.text}`;
}

export async function generateReportPdfBuffer(input: PdfReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `VenturePilot AI Validation Report - ${input.ideaTitle}`,
        Author: 'VenturePilot AI',
        Subject: `Startup Idea Validation (${input.planName})`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const purple = '#5B21B6';
    const indigo = '#4F46E5';
    const ink = '#0F172A';
    const muted = '#475569';
    const border = '#E2E8F0';

    // Branded Header Banner
    doc.rect(50, 45, 495, 76).fill(purple);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('VenturePilot AI — Validation Report', 66, 59);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(
        `Idea: ${input.ideaTitle}${input.startupName ? `  |  Startup: ${input.startupName}` : ''}`,
        66,
        84,
      );
    doc
      .fontSize(9)
      .text(
        `Plan: ${input.planName}  |  Generated: ${new Date(input.generatedAt).toUTCString()}  |  Report ID: ${input.reportId.slice(0, 8)}`,
        66,
        100,
      );

    doc.moveDown(3.2);
    doc.x = 50;

    // Research mode / DEMO DATA notice
    if (input.researchMode === 'demo') {
      doc
        .fillColor('#92400E')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('DEMO DATA NOTICE: Research citations below use sample DEMO DATA sources (SONAR_API_KEY not set).');
      doc.moveDown(0.5);
    } else if (input.researchMode === 'none') {
      doc
        .fillColor('#991B1B')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text('RESEARCH NOT CONFIGURED: No external research API key or demo mode active; unverified market claims are labelled Unverified.');
      doc.moveDown(0.5);
    }

    // Fixed Scoring Disclaimer
    doc
      .fillColor(indigo)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Scoring Disclaimer');
    doc
      .fillColor(ink)
      .font('Helvetica-Oblique')
      .fontSize(9.5)
      .text(SCORING_DISCLAIMER);
    doc.moveDown(0.8);

    // 6 Validation Scores
    doc.fillColor(purple).font('Helvetica-Bold').fontSize(13).text('Validation Readiness Scores (0–10)');
    doc.moveDown(0.4);

    for (const meta of SCORE_LABELS) {
      const scoreItem = input.reportJson.scores[meta.key];
      doc
        .fillColor(ink)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`${meta.title}: ${scoreItem.score.toFixed(1)} / 10  [${scoreItem.evidenceLabel}]`);
      doc
        .fillColor(muted)
        .font('Helvetica')
        .fontSize(9.5)
        .text(scoreItem.explanation, { indent: 12 });
      doc.moveDown(0.35);
    }

    // Extracted Concepts & Workspace Similarity
    if (input.concepts.length > 0 || input.similarIdeas.length > 0) {
      doc.moveDown(0.4);
      doc.fillColor(purple).font('Helvetica-Bold').fontSize(12).text('Extracted Concepts & Workspace Similarity');
      doc.moveDown(0.3);
      if (input.concepts.length > 0) {
        doc
          .fillColor(ink)
          .font('Helvetica')
          .fontSize(9.5)
          .text(`Key Concepts: ${input.concepts.join(', ')}`);
      }
      if (input.similarIdeas.length > 0) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(9.5).text('Similar Ideas (Your Workspace Only):');
        for (const sim of input.similarIdeas) {
          doc
            .font('Helvetica')
            .fontSize(9)
            .text(`• ${sim.title} (${sim.status}) — cosine similarity ${(sim.similarityScore * 100).toFixed(1)}%`, {
              indent: 10,
            });
        }
      }
    }

    doc.moveDown(0.6);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(border).stroke();
    doc.moveDown(0.8);

    // All 18 Sections (A–R)
    for (const meta of REPORT_SECTION_META) {
      if (doc.y > 700) {
        doc.addPage();
      }

      doc
        .fillColor(purple)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(`${meta.code}. ${meta.title}`);
      doc.moveDown(0.25);

      if (meta.key === 'swot') {
        const swot = input.reportJson.sections.swot;
        const quadrants: Array<{ label: string; items: ReportClaim[] }> = [
          { label: 'Strengths', items: swot.strengths },
          { label: 'Weaknesses', items: swot.weaknesses },
          { label: 'Opportunities', items: swot.opportunities },
          { label: 'Threats', items: swot.threats },
        ];
        for (const q of quadrants) {
          doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text(q.label);
          for (const item of q.items) {
            doc
              .fillColor(muted)
              .font('Helvetica')
              .fontSize(9.5)
              .text(formatClaimLine(item), { indent: 10 });
          }
          doc.moveDown(0.25);
        }
      } else {
        const sec = input.reportJson.sections[meta.key];
        doc.fillColor(ink).font('Helvetica').fontSize(10).text(sec.summary);
        doc.moveDown(0.25);
        for (const item of sec.items) {
          doc
            .fillColor(muted)
            .font('Helvetica')
            .fontSize(9.5)
            .text(formatClaimLine(item), { indent: 10 });
        }
      }

      doc.moveDown(0.65);
    }

    // Sources & Citations
    if (doc.y > 680) {
      doc.addPage();
    }
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(border).stroke();
    doc.moveDown(0.6);
    doc.fillColor(purple).font('Helvetica-Bold').fontSize(13).text('Research Sources & Citations');
    doc.moveDown(0.3);

    if (input.sources.length === 0) {
      doc
        .fillColor(muted)
        .font('Helvetica')
        .fontSize(9.5)
        .text('No external research sources were retrieved for this report (Research Not configured).');
    } else {
      for (const src of input.sources) {
        const demoTag = src.isDemo ? ' [DEMO DATA]' : '';
        doc
          .fillColor(ink)
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text(`[${src.sourceRef}]${demoTag} ${src.title}`);
        doc.fillColor(indigo).font('Helvetica').fontSize(8.5).text(`URL: ${src.url}`, { indent: 10 });
        doc
          .fillColor(muted)
          .font('Helvetica')
          .fontSize(8.5)
          .text(`Retrieved: ${new Date(src.retrievedAt).toUTCString()}`, { indent: 10 });
        doc.fillColor(muted).font('Helvetica').fontSize(9).text(src.snippet, { indent: 10 });
        doc.moveDown(0.4);
      }
    }

    doc.end();
  });
}
