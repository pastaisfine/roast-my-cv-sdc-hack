/** Editorial, fixed matching taxonomy, not an official DOSM skills classification.
 * Aliases are deliberately specific; English product names are not translated.
 */
const taxonomy = [
  { id: "excel", label: "Excel", aliases: ["Microsoft Excel", "MS Excel"] },
  { id: "sql", label: "SQL", aliases: ["Structured Query Language", "PostgreSQL", "MySQL"] },
  { id: "python", label: "Python", aliases: ["Python programming", "pengaturcaraan Python", "Python编程"] },
  { id: "data-visualisation", label: "Data visualisation", aliases: ["data visualization", "visualisasi data", "数据可视化", "Power BI", "Tableau"] },
  { id: "statistics", label: "Statistics", aliases: ["statistical analysis", "analisis statistik", "统计分析"] },
  { id: "machine-learning", label: "Machine learning", aliases: ["pembelajaran mesin", "机器学习"] },
  { id: "software-development", label: "Software development", aliases: ["pembangunan perisian", "软件开发", "JavaScript", "TypeScript"] },
  { id: "git", label: "Git", aliases: ["Git version control", "kawalan versi Git", "Git版本控制"] },
  { id: "software-testing", label: "Software testing", aliases: ["unit testing", "unit test", "unit tests", "Jest", "ujian perisian", "软件测试"] },
  { id: "requirements-analysis", label: "Requirements analysis", aliases: ["requirements gathering", "analisis keperluan", "需求分析"] },
  { id: "cybersecurity", label: "Cybersecurity", aliases: ["cyber security", "keselamatan siber", "网络安全"] },
  { id: "incident-response", label: "Incident response", aliases: ["security incident response", "tindak balas insiden", "安全事件响应"] },
  { id: "networking", label: "Computer networking", aliases: ["computer networks", "rangkaian komputer", "计算机网络"] },
  { id: "linux", label: "Linux administration", aliases: ["Linux", "pentadbiran Linux", "Linux系统管理"] },
  { id: "it-support", label: "IT support", aliases: ["technical support", "sokongan IT", "sokongan teknikal", "IT技术支持"] },
  { id: "accounting", label: "Accounting", aliases: ["perakaunan", "会计", "bookkeeping", "book-keeping"] },
  { id: "budgeting", label: "Budgeting", aliases: ["budget preparation", "penyediaan bajet", "预算编制"] },
  { id: "financial-analysis", label: "Financial analysis", aliases: ["analisis kewangan", "财务分析", "financial modelling"] },
  { id: "audit", label: "Auditing", aliases: ["financial audit", "pengauditan", "财务审计"] },
  { id: "project-management", label: "Project management", aliases: ["pengurusan projek", "项目管理"] },
  { id: "stakeholder-communication", label: "Stakeholder communication", aliases: ["stakeholder engagement", "komunikasi pihak berkepentingan", "利益相关方沟通"] },
  { id: "people-management", label: "People management", aliases: ["team management", "pengurusan pasukan", "团队管理"] },
  { id: "recruitment", label: "Recruitment", aliases: ["staff recruitment", "pengambilan pekerja", "人员招聘"] },
  { id: "marketing", label: "Marketing campaigns", aliases: ["marketing campaign", "kempen pemasaran", "营销活动"] },
  { id: "market-research", label: "Market research", aliases: ["penyelidikan pasaran", "市场调研"] },
  { id: "sales", label: "Sales", aliases: ["sales experience", "jualan", "销售"] },
  { id: "cad", label: "Computer-aided design", aliases: ["CAD", "AutoCAD", "SolidWorks", "reka bentuk berbantu komputer", "计算机辅助设计"] },
  { id: "process-improvement", label: "Process improvement", aliases: ["Lean manufacturing", "penambahbaikan proses", "流程改进"] },
  { id: "quality-control", label: "Quality control", aliases: ["quality assurance", "kawalan kualiti", "质量控制"] },
  { id: "maintenance", label: "Equipment maintenance", aliases: ["preventive maintenance", "penyelenggaraan peralatan", "设备维护"] },
  { id: "safety", label: "Workplace safety", aliases: ["occupational safety", "keselamatan pekerjaan", "职业安全"] },
  { id: "documentation", label: "Documentation", aliases: ["document management", "pengurusan dokumen", "文档管理"] },
  { id: "data-entry", label: "Data entry", aliases: ["kemasukan data", "数据录入"] },
  { id: "customer-service", label: "Customer service", aliases: ["khidmat pelanggan", "perkhidmatan pelanggan", "客户服务"] },
  { id: "inventory", label: "Inventory management", aliases: ["stock control", "pengurusan inventori", "库存管理"] },
  { id: "cash-handling", label: "Cash handling", aliases: ["cash reconciliation", "pengendalian wang tunai", "现金管理", "point of sale"] },
  { id: "food-preparation", label: "Food preparation", aliases: ["penyediaan makanan", "食品制作"] },
  { id: "food-safety", label: "Food safety", aliases: ["food hygiene", "keselamatan makanan", "食品安全"] },
] as const;

export type SkillId = (typeof taxonomy)[number]["id"];
export const skills: { id: SkillId; label: string; aliases: string[] }[] =
  taxonomy.map((skill) => ({ id: skill.id, label: skill.label, aliases: [...skill.aliases] }));
