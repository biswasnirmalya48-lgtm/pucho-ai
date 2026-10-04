/**
 * UI copy in the four languages PUCHO supports.
 * Answers come back in the user's chosen language via the system prompt;
 * this dictionary only handles the interface itself.
 */
import type { Settings } from './types'

export type Lang = Settings['language']

export interface Dict {
  newChat: string
  search: string
  recent: string
  projects: string
  saved: string
  settings: string
  archived: string
  untitled: string
  noChats: string
  noChatsHint: string
  askAnything: string
  send: string
  stop: string
  attach: string
  voice: string
  listening: string
  thinking: string
  searchingWeb: string
  emptyTitle: string
  emptySubtitle: string
  suggestExplain: string
  suggestCode: string
  suggestImage: string
  suggestStudy: string
  suggestBrainstorm: string
  suggestResearch: string
  copy: string
  copied: string
  copyResponse: string
  regenerate: string
  edit: string
  continue: string
  rename: string
  remove: string
  delete: string
  cancel: string
  save: string
  confirm: string
  deleteChat: string
  deleteChatBody: string
  archive: string
  unarchive: string
  searchChats: string
  searchHint: string
  noResults: string
  settingsTitle: string
  general: string
  aiSection: string
  chatSection: string
  voiceSection: string
  dataSection: string
  aboutSection: string
  theme: string
  language: string
  responseStyle: string
  name: string
  defaultMode: string
  autoTitle: string
  sendOnEnter: string
  voiceInput: string
  readAloud: string
  reducedMotion: string
  exportChats: string
  deleteAllChats: string
  version: string
  poweredBy: string
  newProject: string
  projectName: string
  projectInstructions: string
  projectContext: string
  noProjects: string
  noProjectsHint: string
  files: string
  sources: string
  sourcesNote: string
  researchUnavailable: string
  settingsSaved: string
  offline: string
  mode: string
}

const en: Dict = {
  newChat: 'New Chat',
  search: 'Search',
  recent: 'Recent',
  projects: 'Projects',
  saved: 'Saved',
  settings: 'Settings',
  archived: 'Archived',
  untitled: 'Untitled chat',
  noChats: 'No conversations yet',
  noChatsHint: 'Ask PUCHO anything to begin.',
  askAnything: 'Ask PUCHO anything...',
  send: 'Send',
  stop: 'Stop',
  attach: 'Attach a file',
  voice: 'Voice input',
  listening: 'Listening…',
  thinking: 'PUCHO is thinking…',
  searchingWeb: 'Searching the web…',
  emptyTitle: 'Bas Pucho.',
  emptySubtitle: 'Questions, ideas, code, research, problems — just ask.',
  suggestExplain: 'Explain something',
  suggestCode: 'Help me code',
  suggestImage: 'Analyze an image',
  suggestStudy: 'Study with me',
  suggestBrainstorm: 'Brainstorm an idea',
  suggestResearch: 'Research a topic',
  copy: 'Copy',
  copied: 'Copied',
  copyResponse: 'Copy response',
  regenerate: 'Regenerate',
  edit: 'Edit',
  continue: 'Continue',
  rename: 'Rename',
  remove: 'Remove',
  delete: 'Delete',
  cancel: 'Cancel',
  save: 'Save',
  confirm: 'Confirm',
  deleteChat: 'Delete this chat?',
  deleteChatBody: 'The conversation and its messages will be removed permanently.',
  archive: 'Archive',
  unarchive: 'Unarchive',
  searchChats: 'Search chats',
  searchHint: 'Search titles, your questions and PUCHO answers',
  noResults: 'Nothing matched that search.',
  settingsTitle: 'Settings',
  general: 'General',
  aiSection: 'AI',
  chatSection: 'Chat',
  voiceSection: 'Voice',
  dataSection: 'Data',
  aboutSection: 'About',
  theme: 'Theme',
  language: 'Language',
  responseStyle: 'Response style',
  name: 'Your name',
  defaultMode: 'Default mode',
  autoTitle: 'Auto-name conversations',
  sendOnEnter: 'Enter sends the message',
  voiceInput: 'Voice input',
  readAloud: 'Read answers aloud',
  reducedMotion: 'Reduce animations',
  exportChats: 'Export chats',
  deleteAllChats: 'Delete all chats',
  version: 'PUCHO version',
  poweredBy: 'Powered by GROQ',
  newProject: 'New project',
  projectName: 'Project name',
  projectInstructions: 'Instructions',
  projectContext: 'Project context',
  noProjects: 'No projects yet',
  noProjectsHint: 'Group chats, files and context around one piece of work.',
  files: 'Files',
  sources: 'Sources',
  sourcesNote: 'Live sources used for this answer',
  researchUnavailable: 'Live web research is not configured on this server, so this answer is from PUCHO’s own knowledge.',
  settingsSaved: 'Settings saved',
  offline: "PUCHO can't reach the server",
  mode: 'Mode',
}

const hi: Dict = {
  newChat: 'नई चैट',
  search: 'खोजें',
  recent: 'हाल की',
  projects: 'प्रोजेक्ट',
  saved: 'सहेजी गई',
  settings: 'सेटिंग्स',
  archived: 'आर्काइव',
  untitled: 'बिना नाम की चैट',
  noChats: 'अभी कोई बातचीत नहीं',
  noChatsHint: 'शुरू करने के लिए PUCHO से कुछ भी पूछें।',
  askAnything: 'PUCHO से कुछ भी पूछें…',
  send: 'भेजें',
  stop: 'रोकें',
  attach: 'फ़ाइल जोड़ें',
  voice: 'आवाज़ से पूछें',
  listening: 'सुन रहा हूँ…',
  thinking: 'PUCHO सोच रहा है…',
  searchingWeb: 'वेब खोज रहा हूँ…',
  emptyTitle: 'Bas Pucho.',
  emptySubtitle: 'सवाल, आइडिया, कोड, रिसर्च, समस्याएँ — बस पूछिए।',
  suggestExplain: 'कुछ समझाओ',
  suggestCode: 'कोड में मदद करो',
  suggestImage: 'इमेज समझो',
  suggestStudy: 'मुझे पढ़ाओ',
  suggestBrainstorm: 'आइडिया ब्रेनस्टॉर्म',
  suggestResearch: 'विषय पर रिसर्च',
  copy: 'कॉपी',
  copied: 'कॉपी हो गया',
  copyResponse: 'जवाब कॉपी करें',
  regenerate: 'दोबारा बनाएँ',
  edit: 'संपादित करें',
  continue: 'जारी रखें',
  rename: 'नाम बदलें',
  remove: 'हटाएँ',
  delete: 'डिलीट',
  cancel: 'रद्द करें',
  save: 'सेव करें',
  confirm: 'पुष्टि करें',
  deleteChat: 'यह चैट डिलीट करें?',
  deleteChatBody: 'यह बातचीत और इसके सभी संदेश हमेशा के लिए हट जाएँगे।',
  archive: 'आर्काइव करें',
  unarchive: 'आर्काइव से हटाएँ',
  searchChats: 'चैट खोजें',
  searchHint: 'नाम, आपके सवाल और PUCHO के जवाब खोजें',
  noResults: 'इस खोज से कुछ नहीं मिला।',
  settingsTitle: 'सेटिंग्स',
  general: 'सामान्य',
  aiSection: 'एआई',
  chatSection: 'चैट',
  voiceSection: 'आवाज़',
  dataSection: 'डेटा',
  aboutSection: 'परिचय',
  theme: 'थीम',
  language: 'भाषा',
  responseStyle: 'जवाब की शैली',
  name: 'आपका नाम',
  defaultMode: 'डिफ़ॉल्ट मोड',
  autoTitle: 'बातचीत का नाम अपने आप रखें',
  sendOnEnter: 'Enter से संदेश भेजें',
  voiceInput: 'आवाज़ से इनपुट',
  readAloud: 'जवाब सुनाएँ',
  reducedMotion: 'एनिमेशन कम करें',
  exportChats: 'चैट एक्सपोर्ट करें',
  deleteAllChats: 'सभी चैट डिलीट करें',
  version: 'PUCHO संस्करण',
  poweredBy: 'GROQ द्वारा संचालित',
  newProject: 'नया प्रोजेक्ट',
  projectName: 'प्रोजेक्ट का नाम',
  projectInstructions: 'निर्देश',
  projectContext: 'प्रोजेक्ट संदर्भ',
  noProjects: 'अभी कोई प्रोजेक्ट नहीं',
  noProjectsHint: 'एक काम के चारों ओर चैट, फ़ाइल और संदर्भ रखें।',
  files: 'फ़ाइलें',
  sources: 'स्रोत',
  sourcesNote: 'इस जवाब के लिए इस्तेमाल किए गए लाइव स्रोत',
  researchUnavailable: 'इस सर्वर पर लाइव वेब रिसर्च सेट नहीं है, इसलिए यह जवाब PUCHO के अपने ज्ञान से है।',
  settingsSaved: 'सेटिंग्स सेव हो गईं',
  offline: 'PUCHO सर्वर तक नहीं पहुँच पा रहा',
  mode: 'मोड',
}

const bn: Dict = {
  newChat: 'নতুন চ্যাট',
  search: 'খুঁজুন',
  recent: 'সাম্প্রতিক',
  projects: 'প্রজেক্ট',
  saved: 'সংরক্ষিত',
  settings: 'সেটিংস',
  archived: 'আর্কাইভ',
  untitled: 'শিরোনামহীন চ্যাট',
  noChats: 'এখনও কোনো কথোপকথন নেই',
  noChatsHint: 'শুরু করতে PUCHO-কে যা খুশি জিজ্ঞাসা করুন।',
  askAnything: 'PUCHO-কে যা খুশি জিজ্ঞাসা করুন…',
  send: 'পাঠান',
  stop: 'থামুন',
  attach: 'ফাইল যোগ করুন',
  voice: 'ভয়েস ইনপুট',
  listening: 'শুনছি…',
  thinking: 'PUCHO ভাবছে…',
  searchingWeb: 'ওয়েবে খুঁজছি…',
  emptyTitle: 'Bas Pucho.',
  emptySubtitle: 'প্রশ্ন, ভাবনা, কোড, রিসার্চ, সমস্যা — শুধু জিজ্ঞাসা করুন।',
  suggestExplain: 'কিছু বুঝিয়ে বলুন',
  suggestCode: 'কোডে সাহায্য করুন',
  suggestImage: 'ছবি বিশ্লেষণ করুন',
  suggestStudy: 'আমাকে শেখান',
  suggestBrainstorm: 'একটি ধারণা নিয়ে আলোচনা',
  suggestResearch: 'বিষয়ে গবেষণা',
  copy: 'কপি',
  copied: 'কপি হয়েছে',
  copyResponse: 'উত্তর কপি করুন',
  regenerate: 'আবার তৈরি করুন',
  edit: 'সম্পাদনা',
  continue: 'চালিয়ে যান',
  rename: 'নাম বদলান',
  remove: 'সরান',
  delete: 'মুছুন',
  cancel: 'বাতিল',
  save: 'সংরক্ষণ',
  confirm: 'নিশ্চিত করুন',
  deleteChat: 'এই চ্যাট মুছবেন?',
  deleteChatBody: 'কথোপকথনটি ও তার সব বার্তা স্থায়ীভাবে মুছে যাবে।',
  archive: 'আর্কাইভ',
  unarchive: 'আর্কাইভ থেকে বের করুন',
  searchChats: 'চ্যাট খুঁজুন',
  searchHint: 'শিরোনাম, আপনার প্রশ্ন ও PUCHO-এর উত্তর খুঁজুন',
  noResults: 'এই অনুসন্ধানে কিছু মেলেনি।',
  settingsTitle: 'সেটিংস',
  general: 'সাধারণ',
  aiSection: 'এআই',
  chatSection: 'চ্যাট',
  voiceSection: 'ভয়েস',
  dataSection: 'ডেটা',
  aboutSection: 'পরিচিতি',
  theme: 'থিম',
  language: 'ভাষা',
  responseStyle: 'উত্তরের ধরন',
  name: 'আপনার নাম',
  defaultMode: 'ডিফল্ট মোড',
  autoTitle: 'কথোপকথনের নাম নিজে থেকে দিন',
  sendOnEnter: 'Enter চাপলে বার্তা যাবে',
  voiceInput: 'ভয়েস ইনপুট',
  readAloud: 'উত্তর পড়ে শোনান',
  reducedMotion: 'অ্যানিমেশন কমান',
  exportChats: 'চ্যাট এক্সপোর্ট',
  deleteAllChats: 'সব চ্যাট মুছুন',
  version: 'PUCHO সংস্করণ',
  poweredBy: 'GROQ দ্বারা চালিত',
  newProject: 'নতুন প্রজেক্ট',
  projectName: 'প্রজেক্টের নাম',
  projectInstructions: 'নির্দেশনা',
  projectContext: 'প্রজেক্টের প্রসঙ্গ',
  noProjects: 'এখনও কোনো প্রজেক্ট নেই',
  noProjectsHint: 'একটি কাজের চ্যাট, ফাইল ও প্রসঙ্গ একসাথে রাখুন।',
  files: 'ফাইল',
  sources: 'সূত্র',
  sourcesNote: 'এই উত্তরে ব্যবহৃত লাইভ সূত্র',
  researchUnavailable: 'এই সার্ভারে লাইভ ওয়েব রিসার্চ চালু নেই, তাই উত্তরটি PUCHO-এর নিজের জ্ঞান থেকে।',
  settingsSaved: 'সেটিংস সংরক্ষিত হয়েছে',
  offline: 'PUCHO সার্ভারে পৌঁছাতে পারছে না',
  mode: 'মোড',
}

const hinglish: Dict = {
  ...en,
  newChat: 'Nayi chat',
  search: 'Search karo',
  recent: 'Pichhle chats',
  projects: 'Projects',
  saved: 'Saved chats',
  settings: 'Settings',
  archived: 'Archived',
  untitled: 'Bina naam ki chat',
  noChats: 'Abhi koi chat nahi',
  noChatsHint: 'Shuru karne ke liye PUCHO se kuch bhi pucho.',
  askAnything: 'PUCHO se kuch bhi pucho…',
  send: 'Bhejo',
  stop: 'Roko',
  attach: 'File lagao',
  voice: 'Voice se likho',
  listening: 'Sun raha hoon…',
  thinking: 'PUCHO soch raha hai…',
  searchingWeb: 'Web pe dhundh raha hoon…',
  emptySubtitle: 'Sawal, ideas, code, research, problems — bas pucho.',
  suggestExplain: 'Kuch samjhao',
  suggestCode: 'Code mein madad karo',
  suggestImage: 'Image samjhao',
  suggestStudy: 'Mujhe padhao',
  suggestBrainstorm: 'Ek idea socho',
  suggestResearch: 'Topic pe research karo',
  copied: 'Copy ho gaya',
  copyResponse: 'Answer copy karo',
  regenerate: 'Dobara banao',
  edit: 'Edit karo',
  continue: 'Aage badhao',
  rename: 'Naam badlo',
  delete: 'Delete karo',
  cancel: 'Cancel',
  save: 'Save karo',
  deleteChat: 'Ye chat delete karni hai?',
  deleteChatBody: 'Ye conversation aur saare messages hamesha ke liye delete ho jayenge.',
  searchChats: 'Chat search karo',
  searchHint: 'Naam, aapke sawaal aur PUCHO ke answers dhoondho',
  noResults: 'Is search se kuch nahi mila.',
  researchUnavailable: 'Is server pe live web research set nahi hai, isliye ye answer PUCHO ke apne knowledge se hai.',
  settingsSaved: 'Settings save ho gayi',
  offline: "PUCHO server tak nahi pahunch pa raha",
  files: 'Files',
  sources: 'Sources',
}

const DICTS: Record<Lang, Dict> = { english: en, hindi: hi, bengali: bn, hinglish: hinglish }

export function dictFor(language: Lang): Dict {
  return DICTS[language] ?? en
}

export const LANGUAGE_LABELS: Record<Lang, string> = {
  english: 'English',
  hindi: 'हिन्दी',
  bengali: 'বাংলা',
  hinglish: 'Hinglish',
}

export const STYLE_LABELS: Record<Settings['responseStyle'], string> = {
  simple: 'Simple',
  balanced: 'Balanced',
  detailed: 'Detailed',
}

/** Prompts pre-filled into the composer by the suggestion cards. */
export const SUGGESTIONS: { key: keyof Dict; prompt: string }[] = [
  {
    key: 'suggestExplain',
    prompt: 'Explain how a black hole forms, like I am 12 years old.',
  },
  {
    key: 'suggestCode',
    prompt: 'Write a TypeScript function that debounces an async callback, and explain how it works.',
  },
  {
    key: 'suggestImage',
    prompt: 'What is in this image? Describe it, then explain what it is showing.',
  },
  {
    key: 'suggestStudy',
    prompt: 'Teach me the basics of probability, then quiz me with 5 questions.',
  },
  {
    key: 'suggestBrainstorm',
    prompt: 'Brainstorm 10 unusual ideas for a side project I could build in two weeks.',
  },
  {
    key: 'suggestResearch',
    prompt: 'Research the trade-offs between SQLite and Postgres for a small SaaS backend.',
  },
]