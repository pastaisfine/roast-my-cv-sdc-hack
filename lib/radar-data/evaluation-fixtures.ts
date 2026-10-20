/** Labelled synthetic evaluation inputs only. Not measured model performance. */
export const evaluationFixtures = [
  { language: "en", text: "I used SQL to join tables and summarise sales.", skillId: "sql", accepted: true },
  { language: "ms", text: "Saya menggunakan SQL untuk menggabungkan jadual jualan.", skillId: "sql", accepted: true },
  { language: "zh", text: "我使用了SQL合并销售数据表。", skillId: "sql", accepted: true },
  { language: "en", text: "I built interactive charts to explain monthly performance.", skillId: "data-visualisation", accepted: true },
  { language: "ms", text: "Saya membina carta interaktif untuk menerangkan prestasi bulanan.", skillId: "data-visualisation", accepted: true },
  { language: "zh", text: "我创建了交互式图表来说明每月业绩。", skillId: "data-visualisation", accepted: true },
  { language: "en", text: "I have never used Python.", skillId: "python", accepted: false },
  { language: "ms", text: "Saya belum menggunakan Python.", skillId: "python", accepted: false },
  { language: "zh", text: "我没有使用过Python。", skillId: "python", accepted: false },
  { language: "en", text: "I want to learn machine learning.", skillId: "machine-learning", accepted: false },
  { language: "ms", text: "Saya ingin belajar pembelajaran mesin.", skillId: "machine-learning", accepted: false },
  { language: "zh", text: "我想学习机器学习。", skillId: "machine-learning", accepted: false },
  { language: "en", text: "Our team used Python; my part was organising meetings.", skillId: "python", accepted: false },
  { language: "en", text: "I have basic exposure to SQL.", skillId: "sql", accepted: false },
  { language: "ms", text: "Saya mempunyai pengetahuan asas SQL.", skillId: "sql", accepted: false },
  { language: "zh", text: "我只有SQL基础知识。", skillId: "sql", accepted: false },
] as const;
