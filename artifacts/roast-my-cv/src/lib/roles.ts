export type LabourSnapshot = {
  sourceUrl: string;
  publishedDate: string;
  period: string;
  metrics: { label: string; value: string; note: string }[];
};

export type RoleProfile = {
  title: string;
  sector: string;
  mycolCritical: boolean;
  skills: string[];
  taskExposure: number;
  sdgs: { number: number; title: string; relevance: string }[];
};

export const labourSnapshot: LabourSnapshot = {
  sourceUrl: "https://www.dosm.gov.my/portal-main/release-content/employment-statistics-Q22026",
  publishedDate: "13 Aug 2026",
  period: "Q2 2026",
  metrics: [
    { label: "Total jobs", value: "9.25m", note: "Broad labour-market total" },
    { label: "Vacancies", value: "195.7k", note: "All sectors; not role-specific" },
    { label: "Services", value: "4.86m jobs", note: "14.4k jobs created" },
    { label: "Manufacturing", value: "114.0k vacancies", note: "58.3% of all vacancies; 12.1k jobs created" },
  ],
};

export const mycolUrl =
  "https://www.talentcorp.com.my/images/uploads/publication/204/MyMahir-Malaysia-Critical-Occupations-List-MyCOL20242025-1773385490.pdf";

export const roles: RoleProfile[] = [
  { title: "Data Analyst", sector: "Digital & data", mycolCritical: true, skills: ["Excel", "SQL", "Python", "Power BI", "Tableau", "data visualisation", "statistics", "dashboard", "business analysis"], taskExposure: .48, sdgs: [{ number: 8, title: "Decent work", relevance: "Evidence-led workforce and business decisions." }, { number: 9, title: "Industry & innovation", relevance: "Data supports more productive services." }] },
  { title: "Business Data Analyst", sector: "Digital & data", mycolCritical: true, skills: ["SQL", "Excel", "Power BI", "requirements", "stakeholder", "business analysis", "data visualisation", "presentation"], taskExposure: .43, sdgs: [{ number: 8, title: "Decent work", relevance: "Turns business questions into measurable work." }, { number: 9, title: "Industry & innovation", relevance: "Helps organisations improve products and processes." }] },
  { title: "Data Scientist", sector: "Digital & data", mycolCritical: true, skills: ["Python", "machine learning", "statistics", "SQL", "pandas", "modelling", "data visualisation"], taskExposure: .55, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Applied modelling can support innovation." }, { number: 8, title: "Decent work", relevance: "Builds analytical capability across sectors." }] },
  { title: "Software Developer", sector: "Technology", mycolCritical: true, skills: ["JavaScript", "TypeScript", "Python", "Git", "API", "React", "testing", "SQL", "cloud"], taskExposure: .58, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Software enables digital products and infrastructure." }, { number: 8, title: "Decent work", relevance: "Digital capability supports productive work." }] },
  { title: "Software Engineer (Python)", sector: "Technology", mycolCritical: true, skills: ["Python", "Git", "API", "SQL", "testing", "cloud", "data structures", "automation"], taskExposure: .56, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Software engineering supports resilient digital systems." }] },
  { title: "Cybersecurity Analyst/Specialist", sector: "Technology", mycolCritical: true, skills: ["cybersecurity", "network", "Linux", "security", "incident response", "SIEM", "risk", "Python"], taskExposure: .32, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Security helps keep digital infrastructure resilient." }, { number: 16, title: "Peace, justice & strong institutions", relevance: "Supports trusted and secure institutions." }] },
  { title: "Information Security Officer", sector: "Technology", mycolCritical: true, skills: ["security", "risk", "compliance", "audit", "cybersecurity", "ISO 27001", "policy"], taskExposure: .29, sdgs: [{ number: 16, title: "Peace, justice & strong institutions", relevance: "Good security governance supports trustworthy organisations." }] },
  { title: "Finance Manager", sector: "Finance", mycolCritical: true, skills: ["accounting", "financial modelling", "Excel", "budgeting", "forecasting", "audit", "SQL", "Power BI"], taskExposure: .46, sdgs: [{ number: 8, title: "Decent work", relevance: "Sound financial decisions support sustainable organisations." }] },
  { title: "ICT Manager", sector: "Technology", mycolCritical: true, skills: ["IT support", "cloud", "network", "project management", "cybersecurity", "vendor", "service desk"], taskExposure: .41, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Reliable ICT operations enable resilient services." }] },
  { title: "IT System Administrator", sector: "Technology", mycolCritical: true, skills: ["Linux", "Windows Server", "network", "cloud", "IT support", "security", "scripting", "backup"], taskExposure: .39, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "System administration maintains digital infrastructure." }] },
  { title: "Industrial & Production Engineer", sector: "Manufacturing", mycolCritical: true, skills: ["Lean", "process improvement", "quality", "Excel", "CAD", "supply chain", "statistics", "manufacturing"], taskExposure: .35, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Process improvement supports productive industry." }, { number: 12, title: "Responsible consumption & production", relevance: "Efficiency work can reduce waste." }] },
  { title: "Mechanical Engineer", sector: "Manufacturing", mycolCritical: true, skills: ["CAD", "SolidWorks", "mechanical design", "manufacturing", "maintenance", "project management", "quality"], taskExposure: .31, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Engineering contributes to industrial capability." }] },
  { title: "Manufacturing Professional", sector: "Manufacturing", mycolCritical: true, skills: ["manufacturing", "quality", "Lean", "safety", "Excel", "production planning", "maintenance"], taskExposure: .34, sdgs: [{ number: 9, title: "Industry & innovation", relevance: "Manufacturing skills support productive industry." }, { number: 12, title: "Responsible consumption & production", relevance: "Quality and process work can improve resource use." }] },
  { title: "Marketing Coordinator", sector: "Services", mycolCritical: false, skills: ["marketing", "content", "social media", "analytics", "campaign", "Canva", "copywriting"], taskExposure: .61, sdgs: [{ number: 8, title: "Decent work", relevance: "Marketing capability can support small businesses and jobs." }] },
  { title: "Project Coordinator", sector: "Services", mycolCritical: false, skills: ["project management", "Excel", "communication", "stakeholder", "documentation", "planning", "Agile"], taskExposure: .42, sdgs: [{ number: 8, title: "Decent work", relevance: "Coordination skills transfer across productive sectors." }] },
];
