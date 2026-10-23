"""Transparent, non-persistent scam signal checks for citizen safety workflows."""

import re


_RULES = (
    {
        "code": "credential_request",
        "title": "Sensitive credentials may be requested",
        "explanation": "The message pairs a password, OTP, PIN, or card security term with a request to share, enter, or verify it.",
        "weight": 4,
        "patterns": (
            re.compile(r"\b(?:share|send|tell|provide|enter|confirm|verify|reply\s+with)\s+(?:your\s+)?(?:otp|one[- ]time password|upi\s+pin|pin|cvv|password|passcode)\b", re.I),
            re.compile(r"\b(?:otp|one[- ]time password|upi\s+pin|pin|cvv|password|passcode)\b.{0,45}\b(?:share|send|tell|provide|enter|confirm|verify|reply)\b", re.I),
            re.compile(r"\b(?:otp|upi\s+pin|pin|cvv|password|passcode)\b.{0,50}\b(?:karo|karein|bhejo|batao|daalo|bharo|share\s+karo)\b", re.I),
            re.compile(r"(?:ओटीपी|वन टाइम पासवर्ड|यूपीआई पिन|पिन|पासवर्ड|सीवीवी).{0,35}(?:भेज|बत|दर्ज|साझा|शेयर|वेरिफाई)", re.I),
            re.compile(r"(?:भेज|बत|दर्ज|साझा|शेयर|वेरिफाई).{0,35}(?:ओटीपी|वन टाइम पासवर्ड|यूपीआई पिन|पिन|पासवर्ड|सीवीवी)", re.I),
            re.compile(r"(?:ওটিপি|পিন|পাসওয়ার্ড).{0,35}(?:শেয়ার|পাঠান|বলুন|দিন|লিখুন|যাচাই)|(?:শেয়ার|পাঠান|বলুন|দিন|লিখুন|যাচাই).{0,35}(?:ওটিপি|পিন|পাসওয়ার্ড)", re.I),
            re.compile(r"(?:ஓடிபி|ஓடிபி|பின்|கடவுச்சொல்).{0,35}(?:பகிர்|அனுப்பு|சொல்லு|உள்ளிடு|உறுதிப்படுத்து)|(?:பகிர்|அனுப்பு|சொல்லு|உள்ளிடு).{0,35}(?:ஓடிபி|பின்|கடவுச்சொல்)", re.I),
            re.compile(r"(?:ఓటీపీ|పిన్|పాస్‌వర్డ్).{0,35}(?:పంచుకో|పంపండి|చెప్పండి|నమోదు|ధృవీకరించ)|(?:పంచుకో|పంపండి|చెప్పండి|నమోదు).{0,35}(?:ఓటీపీ|పిన్|పాస్‌వర్డ్)", re.I),
            re.compile(r"(?:ओटीपी|पिन|पासवर्ड).{0,35}(?:शेअर|सांगा|पाठवा|द्या|टाका|भरा)|(?:शेअर|सांगा|पाठवा|द्या|टाका|भरा).{0,35}(?:ओटीपी|पिन|पासवर्ड)", re.I),
        ),
    },
    {
        "code": "malicious_install",
        "title": "An app install or remote access step appears",
        "explanation": "The message mentions installing an APK or remote access app. Unexpected app installs can expose your device and accounts.",
        "weight": 4,
        "patterns": (
            re.compile(r"\b(?:install|download|open)\b.{0,50}\b(?:apk|application|app|anydesk|teamviewer|screen\s*share)\b", re.I),
            re.compile(r"\b(?:apk|anydesk|teamviewer|remote\s+access)\b", re.I),
            re.compile(r"(?:ऐप|एपीके|apk).{0,35}(?:इंस्टॉल|डाउनलोड|करें|करो)", re.I),
            re.compile(r"(?:অ্যাপ|এপিকে|apk).{0,35}(?:ইনস্টল|ডাউনলোড)|(?:ইনস্টল|ডাউনলোড).{0,35}(?:অ্যাপ|এপিকে|apk)", re.I),
            re.compile(r"(?:செயலி|ஆப்|apk).{0,35}(?:நிறுவ|பதிவிறக்கு)|(?:நிறுவ|பதிவிறக்கு).{0,35}(?:செயலி|ஆப்|apk)", re.I),
            re.compile(r"(?:యాప్|అప్లికేషన్|apk).{0,35}(?:ఇన్‌స్టాల్|డౌన్‌లోడ్)|(?:ఇన్‌స్టాల్|డౌన్‌లోడ్).{0,35}(?:యాప్|అప్లికేషన్|apk)", re.I),
            re.compile(r"(?:अॅप|ॲप|एपीके|apk).{0,35}(?:इन्स्टॉल|डाउनलोड)|(?:इन्स्टॉल|डाउनलोड).{0,35}(?:अॅप|ॲप|एपीके|apk)", re.I),
        ),
    },
    {
        "code": "coercion",
        "title": "Threats or coercion may be used",
        "explanation": "The message contains language linked to digital arrest, blackmail, or threats of immediate legal action.",
        "weight": 4,
        "patterns": (
            re.compile(r"\b(?:digital\s+arrest|under\s+arrest|arrest\s+warrant|sextortion|blackmail|video\s+call\s+recording|nude\s+video)\b", re.I),
            re.compile(r"\b(?:you|your family)\b.{0,45}\b(?:will be arrested|will go to jail|will be charged|will be exposed)\b", re.I),
            re.compile(r"(?:डिजिटल अरेस्ट|गिरफ्तार|ब्लैकमेल|वीडियो वायरल|डिजिटल गिरफ्तारी)", re.I),
            re.compile(r"(?:ডিজিটাল গ্রেপ্তার|গ্রেপ্তার|ব্ল্যাকমেইল|ভিডিও ভাইরাল|হুমকি)", re.I),
            re.compile(r"(?:டிஜிட்டல் கைது|கைது|பிளாக்மெயில்|மிரட்டல்|வீடியோ வைரல்)", re.I),
            re.compile(r"(?:డిజిటల్ అరెస్ట్|అరెస్ట్|బ్లాక్‌మెయిల్|బెదిరింపు|వీడియో వైరల్)", re.I),
            re.compile(r"(?:डिजिटल अटक|अटक|ब्लॅकमेल|धमकी|व्हिडिओ व्हायरल)", re.I),
        ),
    },
    {
        "code": "suspicious_link",
        "title": "A link or shortened URL appears",
        "explanation": "The message contains a web address. Pehra does not open or verify links, so check the address through an official source before visiting.",
        "weight": 2,
        "patterns": (
            re.compile(r"\bhttps?://[^\s<>()]+", re.I),
            re.compile(r"\bwww\.[^\s<>()]+", re.I),
            re.compile(r"\b(?:bit\.ly|tinyurl\.com|t\.co|rb\.gy|cutt\.ly)/[^\s<>()]*", re.I),
        ),
    },
    {
        "code": "urgent_account_action",
        "title": "Urgency or account closure pressure appears",
        "explanation": "The message pressures you to act quickly or threatens a blocked, suspended, or disconnected account or service.",
        "weight": 2,
        "patterns": (
            re.compile(r"\b(?:urgent|immediately|right\s+now|within\s+\d+\s*(?:hours?|minutes?)|act\s+now|last\s+warning|today\s+only|abhi|turant|aaj\s+hi)\b", re.I),
            re.compile(r"\b(?:blocked|suspended|deactivated|disconnected|account\s+will\s+close|sim\s+will\s+stop)\b|\b(?:sim|account|bank|connection)\b.{0,35}\b(?:band|block|suspend|deactivate)(?:\s+ho)?\b", re.I),
            re.compile(r"(?:तुरंत|अभी|आज ही|बंद हो जाएगा|ब्लॉक|निलंबित|कनेक्शन कट)", re.I),
            re.compile(r"(?:জরুরি|এখনই|আজই|অ্যাকাউন্ট বন্ধ|সিম বন্ধ|ব্লক হবে)", re.I),
            re.compile(r"(?:அவசரம்|உடனே|இன்றே|கணக்கு முடக்கம்|சிம் முடக்கம்)", re.I),
            re.compile(r"(?:అత్యవసరం|వెంటనే|ఈరోజే|ఖాతా నిలిపివేత|సిమ్ నిలిపివేత)", re.I),
            re.compile(r"(?:तात्काळ|लगेच|आजच|खाते बंद|सिम बंद|ब्लॉक होईल)", re.I),
        ),
    },
    {
        "code": "authority_impersonation",
        "title": "An official, bank, or telecom identity is mentioned",
        "explanation": "The message refers to a government body, police, bank, courier, or telecom provider. Verify requests through a contact you find independently.",
        "weight": 1,
        "patterns": (
            re.compile(r"\b(?:police|cbi|cyber\s+cell|rbi|income\s+tax|customs|court|government|govt|trai|dot|aadhaar|rto|e[- ]?challan|sbi|hdfc|icici|kyc|sim\s+card|electricity\s+board|courier|parcel)\b", re.I),
            re.compile(r"(?:पुलिस|सीबीआई|सरकार|बैंक|आरबीआई|आधार|केवाईसी|सिम|बिजली विभाग|चालान|कूरियर)", re.I),
            re.compile(r"(?:পুলিশ|সরকার|ব্যাংক|আধার|কেওয়াইসি|আরটিও|চালান)", re.I),
            re.compile(r"(?:காவல்துறை|அரசு|வங்கி|ஆதார்|கேஒய்சி|ஆர்டிஓ|சலான்)", re.I),
            re.compile(r"(?:పోలీసు|ప్రభుత్వం|బ్యాంకు|ఆధార్|కేవైసీ|ఆర్టీఓ|చలాన్)", re.I),
            re.compile(r"(?:पोलीस|सरकार|बँक|आधार|केवायसी|आरटीओ|चलन)", re.I),
        ),
    },
    {
        "code": "payment_request",
        "title": "A payment or money transfer is requested",
        "explanation": "The message includes payment, QR, UPI, refund, or transfer language. Verify the request independently before paying or approving a collect request.",
        "weight": 2,
        "patterns": (
            re.compile(r"\b(?:upi\s+(?:id|collect\s+request)|qr\s+code|scan\s+(?:the\s+)?qr|collect\s+request|send\s+money|transfer\s+money|pay\s+now|processing\s+fee|registration\s+fee|refund\s+fee)\b", re.I),
            re.compile(r"(?:यूपीआई|क्यूआर|पैसे भेज|भुगतान|रिफंड|प्रोसेसिंग फीस|रजिस्ट्रेशन फीस)", re.I),
            re.compile(r"(?:ইউপিআই|কিউআর|টাকা পাঠান|পেমেন্ট|ফেরত|ফি)", re.I),
            re.compile(r"(?:யுபிஐ|க்யூஆர்|பணம் அனுப்பு|கட்டணம்|திருப்பிச் செலுத்து)", re.I),
            re.compile(r"(?:యూపీఐ|క్యూఆర్|డబ్బు పంప|చెల్లింపు|రుసుము|రిఫండ్)", re.I),
            re.compile(r"(?:यूपीआय|क्यूआर|पैसे पाठवा|देयक|परतावा|शुल्क)", re.I),
        ),
    },
    {
        "code": "earnings_lure",
        "title": "A quick income or guaranteed return is promised",
        "explanation": "The message promises unusually fast earnings, guaranteed returns, or a job after an upfront fee.",
        "weight": 2,
        "patterns": (
            re.compile(r"\b(?:guaranteed\s+returns?|double\s+your\s+money|earn\s+\d+\s*(?:daily|per\s+day)|work\s+from\s+home|investment\s+plan|job\s+offer)\b", re.I),
            re.compile(r"\b(?:pay|deposit|registration)\b.{0,40}\b(?:job|work|salary|investment|returns?)\b", re.I),
            re.compile(r"(?:गारंटीड रिटर्न|घर बैठे कमाई|नौकरी के लिए फीस|निवेश योजना)", re.I),
            re.compile(r"(?:নিশ্চিত লাভ|ঘরে বসে আয়|চাকরির জন্য ফি|বিনিয়োগ পরিকল্পনা)", re.I),
            re.compile(r"(?:உறுதியான வருமானம்|வீட்டிலிருந்து வேலை|வேலைக்கான கட்டணம்|முதலீட்டுத் திட்டம்)", re.I),
            re.compile(r"(?:గ్యారంటీ లాభం|ఇంటి నుండి పని|ఉద్యోగం కోసం ఫీజు|పెట్టుబడి పథకం)", re.I),
            re.compile(r"(?:हमीचा परतावा|घरबसल्या कमाई|नोकरीसाठी फी|गुंतवणूक योजना)", re.I),
        ),
    },
    {
        "code": "e_challan_theme",
        "title": "A government e-Challan theme appears",
        "explanation": "Fake e-Challan messages have been used to distribute malicious Android apps. Verify challans through the official portal instead of message links.",
        "weight": 1,
        "patterns": (
            re.compile(r"\b(?:e[- ]?challan|traffic challan|rto challan|parivahan)\b", re.I),
            re.compile(r"(?:ई[- ]?चालान|ट्रैफिक चालान|आरटीओ चालान|परिवहन)", re.I),
            re.compile(r"(?:ই-চালান|ট্রাফিক চালান|আরটিও)", re.I),
            re.compile(r"(?:இ-சலான்|போக்குவரத்து அபராதம்|ஆர்டிஓ)", re.I),
            re.compile(r"(?:ఈ-చలాన్|ట్రాఫిక్ చలాన్|ఆర్టీఓ)", re.I),
            re.compile(r"(?:ई-चलन|वाहतूक चलन|आरटीओ)", re.I),
        ),
    },
)

_NEGATED_CREDENTIAL_WARNING = re.compile(
    r"\b(?:never|do\s+not|don't|dont|never\s+share)\s+(?:share|send|tell|give|provide)\b.{0,35}\b(?:otp|pin|password|cvv)\b|"
    r"\b(?:otp|pin|password|cvv)\b.{0,35}\b(?:never\s+share|do\s+not\s+share|don't\s+share|dont\s+share)\b|"
    r"(?:ओटीपी|पिन|पासवर्ड).{0,25}(?:कभी न बताएं|शेयर न करें|साझा न करें)",
    re.I,
)


def _signal_matches(text: str, rule: dict) -> list[str]:
    terms = []
    for pattern in rule["patterns"]:
        for match in pattern.finditer(text):
            term = match.group(0).strip().rstrip(".,;:!?)\"]}")
            if term and term.casefold() not in {item.casefold() for item in terms}:
                terms.append(term[:120])
            if len(terms) >= 3:
                return terms
    return terms


def analyze_scam_text(
    text: str,
    money_lost: bool = False,
    credentials_shared: bool = False,
) -> dict:
    """Return explainable heuristic signals. This is not a probability or verdict."""
    matched = []
    for rule in _RULES:
        rule_text = text
        if rule["code"] == "credential_request":
            rule_text = _NEGATED_CREDENTIAL_WARNING.sub(" ", text)
        terms = _signal_matches(rule_text, rule)
        if terms:
            matched.append({
                "code": rule["code"],
                "title": rule["title"],
                "explanation": rule["explanation"],
                "matched_terms": terms,
                "weight": rule["weight"],
            })

    codes = {item["code"] for item in matched}
    weight = sum(item["weight"] for item in matched)
    critical_signal = bool(codes & {"credential_request", "malicious_install", "coercion"})
    if critical_signal or weight >= 5:
        risk_level = "high_concern"
        risk_label = "High concern signals found"
    elif weight >= 2 or "e_challan_theme" in codes:
        risk_level = "review"
        risk_label = "Review carefully"
    else:
        risk_level = "no_strong_signals"
        risk_label = "No strong signals matched"

    if "coercion" in codes:
        category = "Possible threat, blackmail, or digital arrest scam"
    elif "malicious_install" in codes:
        category = "Possible malicious app or fake update"
    elif "e_challan_theme" in codes:
        category = "e-Challan message needs independent verification"
    elif "credential_request" in codes:
        category = "Possible credential theft"
    elif "payment_request" in codes:
        category = "Possible payment or UPI fraud"
    elif "earnings_lure" in codes:
        category = "Possible job or investment scam"
    elif "authority_impersonation" in codes:
        category = "Possible authority impersonation"
    elif "suspicious_link" in codes:
        category = "Message contains a link that needs checking"
    else:
        category = "No scam category matched"

    guidance = [
        "Do not reply, share a verification code, install an app, or open a link from an unexpected message.",
        "Verify any request through the official app or a phone number you find independently.",
        "Keep the original message, sender details, and time if you need to report the incident.",
    ]
    official_links = []
    if money_lost:
        guidance.insert(0, "If money has left your account, call 1930 now and contact your bank through its official channel.")
        official_links.append({
            "label": "Call cyber financial fraud helpline 1930",
            "url": "tel:1930",
        })
        official_links.append({
            "label": "Report on the National Cyber Crime Reporting Portal",
            "url": "https://cybercrime.gov.in/",
        })

    if credentials_shared:
        guidance.insert(0, "Contact your bank or affected service through its official channel. Change the exposed password or UPI PIN from a trusted device and review recent account activity. Call 1930 if an unauthorised transaction appears.")
        if not money_lost:
            official_links.append({
                "label": "Report account compromise on the National Cyber Crime Reporting Portal",
                "url": "https://cybercrime.gov.in/",
            })

    communication_signal = codes & {
        "urgent_account_action", "authority_impersonation", "e_challan_theme",
        "suspicious_link", "credential_request", "malicious_install", "coercion",
        "payment_request", "earnings_lure",
    }
    if communication_signal:
        official_links.append({
            "label": "Report suspected fraud communication from the last 30 days using Chakshu",
            "url": "https://sancharsaathi.gov.in/sfc/",
        })

    if "suspicious_link" in codes or "credential_request" in codes:
        guidance.append("NCRP suspect search is only a lead. Entries may be incomplete or inaccurate. A match is not proof, and no match does not establish safety.")
        official_links.append({
            "label": "Check a phone number, UPI ID, email, or account on NCRP",
            "url": "https://cybercrime.gov.in/webform/suspect_search_repository.aspx",
        })
        official_links.append({
            "label": "Report a suspicious URL or identifier to NCRP",
            "url": "https://cybercrime.gov.in/webform/cyber_suspect.aspx",
        })

    if codes & {"payment_request", "earnings_lure", "coercion"} and not money_lost:
        official_links.append({
            "label": "Report cybercrime on the National Cyber Crime Reporting Portal",
            "url": "https://cybercrime.gov.in/",
        })

    if "coercion" in codes:
        guidance.append("For an immediate threat to physical safety, call 112. For online threats or blackmail, use the National Cyber Crime Reporting Portal.")
        official_links.append({
            "label": "Call 112 for immediate danger",
            "url": "tel:112",
        })

    if "e_challan_theme" in codes:
        guidance.append("Check a traffic challan by opening the official Parivahan portal directly. Do not use the link in the message.")
        official_links.append({
            "label": "Check a traffic challan on the official Parivahan portal",
            "url": "https://echallan.parivahan.gov.in/",
        })
        official_links.append({
            "label": "CERT-In advisory on fake e-Challan Android malware",
            "url": "https://www.cert-in.org.in/s2cMainServlet?CACODE=CICA-2026-3492&pageid=PUBADV01",
        })

    # Keep the response small and avoid returning any part of the original message.
    safe_signals = [
        {key: value for key, value in item.items() if key != "weight"}
        for item in matched
    ]
    return {
        "risk_level": risk_level,
        "risk_label": risk_label,
        "category": category,
        "signals": safe_signals,
        "signal_count": len(safe_signals),
        "guidance": guidance,
        "official_links": official_links,
        "assessment_note": "These are transparent text-pattern signals, not a probability, confirmation, or legal finding. No signal match does not prove a message is safe.",
    }
