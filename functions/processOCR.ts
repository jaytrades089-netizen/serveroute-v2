import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.90,
  MEDIUM: 0.75,
  LOW: 0.50,
  REJECT: 0.30
};

const PAY_RATES = {
  serve: 24.00,
  garnishment: 24.00,
  posting: 10.00
};

// Document-specific address patterns
const ADDRESS_PATTERNS = {
  serve: [
    /SERVE\s*AT[:\s]+(.+?)(?:\n|$)/i,
    /Defendant.*?Address[:\s]+(.+?)(?:\n|$)/i,
    /Service\s*Address[:\s]+(.+?)(?:\n|$)/i,
    /Residence[:\s]+(.+?)(?:\n|$)/i
  ],
  garnishment: [
    /Garnishee.*?Address[:\s]+(.+?)(?:\n|$)/i,
    /GARNISHMENT.*?(?:serve|mail).*?to[:\s]+(.+?)(?:\n|$)/i,
    /Third\s*Party.*?Address[:\s]+(.+?)(?:\n|$)/i,
    /Employer.*?Address[:\s]+(.+?)(?:\n|$)/i
  ],
  posting: [
    /POST\s*AT[:\s]+(.+?)(?:\n|$)/i,
    /Posting\s*Address[:\s]+(.+?)(?:\n|$)/i,
    /Property\s*Address[:\s]+(.+?)(?:\n|$)/i,
    /Premises[:\s]+(.+?)(?:\n|$)/i
  ]
};

// Generic fallback pattern
const GENERIC_ADDRESS_PATTERN = /(\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Pl|Place|Way|Cir|Circle)[\w\s,#\.]*),?\s*([A-Za-z\s]+),?\s*(MI|Michigan|OH|Ohio)\s*(\d{5}(?:-\d{4})?)/i;

// Defendant name patterns
const DEFENDANT_PATTERNS = [
  /Defendant[:\s]+([A-Za-z\s,\.]+?)(?:,|\n|Address|$)/i,
  /SERVE[:\s]+([A-Za-z\s,\.]+?)(?:\s+at|\s+@|\n)/i,
  /vs\.?\s+([A-Za-z\s,\.]+?)(?:,|\n|$)/i,
  /TO[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/
];

function generateNormalizedKey(street, city, state, zip) {
  const normalizedStreet = street
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/street/g, 'st')
    .replace(/avenue/g, 'ave')
    .replace(/boulevard/g, 'blvd')
    .replace(/drive/g, 'dr')
    .replace(/road/g, 'rd')
    .replace(/lane/g, 'ln')
    .replace(/court/g, 'ct')
    .replace(/place/g, 'pl')
    .replace(/circle/g, 'cir');
  
  const normalizedCity = city.toLowerCase().replace(/[^a-z]/g, '');
  const normalizedState = state.toUpperCase().replace(/MICHIGAN/i, 'MI').replace(/OHIO/i, 'OH');
  const normalizedZip = zip.replace(/\D/g, '').substring(0, 5);
  
  return `${normalizedStreet}-${normalizedCity}-${normalizedState}-${normalizedZip}`;
}

function parseAddress(text, documentType) {
  // Try document-specific patterns first
  const patterns = ADDRESS_PATTERNS[documentType] || [];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const addressText = match[1];
      const parsed = parseAddressComponents(addressText);
      if (parsed) return parsed;
    }
  }
  
  // Fallback to generic pattern
  const genericMatch = text.match(GENERIC_ADDRESS_PATTERN);
  if (genericMatch) {
    return {
      street: genericMatch[1].trim(),
      city: genericMatch[2].trim(),
      state: genericMatch[3].trim(),
      zip: genericMatch[4].trim()
    };
  }
  
  return null;
}

function parseAddressComponents(addressText) {
  // Try to extract components from a full address string
  const match = addressText.match(/^(.+?),?\s*([A-Za-z\s]+),?\s*(MI|Michigan|OH|Ohio)\s*(\d{5}(?:-\d{4})?)$/i);
  if (match) {
    return {
      street: match[1].trim(),
      city: match[2].trim(),
      state: match[3].trim(),
      zip: match[4].trim()
    };
  }
  return null;
}

function extractDefendantName(text) {
  for (const pattern of DEFENDANT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { imageBase64, documentType, sessionId } = await req.json();
    
    if (!imageBase64) {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }
    
    if (!documentType || !['serve', 'garnishment', 'posting'].includes(documentType)) {
      return Response.json({ error: 'Invalid document type' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'OCR service not configured' }, { status: 500 });
    }

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: imageBase64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }]
        })
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('Vision API error:', errorText);
      return Response.json({ error: 'OCR processing failed' }, { status: 500 });
    }

    const visionData = await visionResponse.json();
    const ocrResult = visionData.responses?.[0];
    
    if (!ocrResult || ocrResult.error) {
      return Response.json({ 
        error: 'OCR failed', 
        details: ocrResult?.error?.message 
      }, { status: 500 });
    }

    const fullText = ocrResult.fullTextAnnotation?.text || '';
    const confidence = ocrResult.fullTextAnnotation?.pages?.[0]?.confidence || 0;
    
    // Parse address from OCR text
    const parsedAddress = parseAddress(fullText, documentType);
    const defendantName = extractDefendantName(fullText);
    
    const processingTime = Date.now() - startTime;
    
    // Determine confidence level
    let confidenceLevel = 'reject';
    if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
      confidenceLevel = 'high';
    } else if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) {
      confidenceLevel = 'medium';
    } else if (confidence >= CONFIDENCE_THRESHOLDS.LOW) {
      confidenceLevel = 'low';
    }

    // Generate normalized key if address was parsed
    let normalizedKey = null;
    if (parsedAddress) {
      normalizedKey = generateNormalizedKey(
        parsedAddress.street,
        parsedAddress.city,
        parsedAddress.state,
        parsedAddress.zip
      );
    }

    // Log the scan
    if (sessionId) {
      await base44.entities.ScanLog.create({
        user_id: user.id,
        company_id: user.company_id,
        session_id: sessionId,
        document_type: documentType,
        image_quality: confidence >= 0.5 ? 'good' : 'poor',
        ocr_confidence: confidence,
        processing_time_ms: processingTime,
        success: !!parsedAddress,
        error_message: parsedAddress ? null : 'Could not extract address',
        address_extracted: !!parsedAddress,
        manual_edit_required: confidenceLevel === 'low' || confidenceLevel === 'reject'
      });
    }

    return Response.json({
      success: !!parsedAddress,
      confidence,
      confidenceLevel,
      processingTimeMs: processingTime,
      rawText: fullText,
      parsedAddress,
      defendantName,
      normalizedKey,
      payRate: PAY_RATES[documentType],
      requiresReview: confidenceLevel === 'medium' || confidenceLevel === 'low',
      requiresManualEntry: confidenceLevel === 'reject' || !parsedAddress
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});