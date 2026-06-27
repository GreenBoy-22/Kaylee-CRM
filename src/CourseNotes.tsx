// src/CourseNotes.tsx
//
// Work tab: BSCSIA Course Notes reference tool.
// - Dropdown to select a course
// - Pre-loaded structured notes from Kaylee's course notes + degree plan
// - Add-a-note section that auto-organizes into bullet categories
// - All notes stored in Supabase course_notes table

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, FileText, Upload, Loader } from 'lucide-react';
import { supabase } from './lib/supabase';

// -- Types ------------------------------------------------------------------

type NoteType = 'general' | 'pacing' | 'structure' | 'cert' | 'student_tips' | 'resources' | 'prereqs' | 'competencies';

interface CourseNote {
  id: string;
  course_code: string;
  note_type: NoteType;
  content: string;
  created_at: string;
  updated_at: string;
}

// -- Course catalog from BSCSIA 202509 degree plan --------------------------

const COURSES: { code: string; title: string; term: number; cert?: string; type: string; cu: number }[] = [
  { code: 'PROGRAM', title: 'Program Overview -- All Certs & Stackables', term: 0, type: 'Reference', cu: 0 },
  { code: 'C458',  title: 'Health, Fitness, and Wellness',             term: 1, type: 'OA', cu: 4 },
  { code: 'D322',  title: 'Introduction to IT',                        term: 1, type: 'OA', cu: 4 },
  { code: 'C683',  title: 'Natural Science Lab',                       term: 1, type: 'PA', cu: 2 },
  { code: 'D685',  title: 'Practical Applications of Prompt',          term: 1, type: 'OA', cu: 2 },
  { code: 'D333',  title: 'Ethics in Technology',                      term: 2, type: 'PA', cu: 3 },
  { code: 'D316',  title: 'IT Foundations',                            term: 2, type: 'Cert', cu: 4, cert: 'CompTIA A+ Core 1' },
  { code: 'C955',  title: 'Applied Probability and Statistics',        term: 2, type: 'OA', cu: 3 },
  { code: 'D270',  title: 'Composition - Successful Self-Expression',  term: 2, type: 'PA', cu: 3 },
  { code: 'C957',  title: 'Applied Algebra',                           term: 3, type: 'OA', cu: 3 },
  { code: 'D317',  title: 'IT Applications',                           term: 3, type: 'Cert', cu: 4, cert: 'CompTIA A+ Core 2' },
  { code: 'D827',  title: 'Fundamentals of Information Security',      term: 3, type: 'OA', cu: 3 },
  { code: 'D315',  title: 'Network and Security - Foundations',        term: 3, type: 'OA', cu: 3 },
  { code: 'D265',  title: 'Critical Thinking: Reason and Evidence',   term: 4, type: 'PA', cu: 3 },
  { code: 'D325',  title: 'Networks',                                  term: 4, type: 'Cert', cu: 4, cert: 'CompTIA Network+' },
  { code: 'D268',  title: 'Intro to Communication: Connecting with Others', term: 4, type: 'PA', cu: 3 },
  { code: 'D336',  title: 'Business of IT - Applications',            term: 4, type: 'Cert', cu: 4, cert: 'Axelos ITIL' },
  { code: 'C963',  title: 'American Politics and the US Constitution', term: 5, type: 'PA', cu: 3 },
  { code: 'D420',  title: 'Discrete Math: Logic',                     term: 5, type: 'OA', cu: 1 },
  { code: 'D329',  title: 'Network and Security - Applications',      term: 5, type: 'Cert', cu: 4, cert: 'CompTIA Security+' },
  { code: 'D828',  title: 'Legal Issues in Information Security',     term: 5, type: 'PA', cu: 4 },
  { code: 'D829',  title: 'Digital Forensics in Cybersecurity',       term: 6, type: 'PA', cu: 4 },
  { code: 'C845',  title: 'Information Systems Security',             term: 6, type: 'PA', cu: 4, cert: 'SSCP (optional voucher)' },
  { code: 'D324',  title: 'Business of IT - Project Management',     term: 6, type: 'Cert', cu: 4, cert: 'CompTIA Project+' },
  { code: 'D421',  title: 'Discrete Math: Functions and Relations',   term: 7, type: 'OA', cu: 1 },
  { code: 'D422',  title: 'Discrete Math: Algorithms and Cryptography', term: 7, type: 'OA', cu: 1 },
  { code: 'D830',  title: 'Introduction to Cryptography',             term: 7, type: 'OA+PA', cu: 4 },
  { code: 'D832',  title: 'Managing Information Security',            term: 7, type: 'PA', cu: 3 },
  { code: 'D278',  title: 'Scripting and Programming - Foundations', term: 7, type: 'OA', cu: 3 },
  { code: 'D281',  title: 'Linux Foundations',                        term: 8, type: 'Cert', cu: 3, cert: 'LPI Linux Essentials' },
  { code: 'D426',  title: 'Data Management - Foundations',            term: 8, type: 'OA', cu: 3 },
  { code: 'D522',  title: 'Python for IT Automation',                 term: 8, type: 'OA', cu: 3 },
  { code: 'D492',  title: 'Data Analytics - Applications',            term: 8, type: 'Cert', cu: 4, cert: 'CompTIA Data+' },
  { code: 'D385',  title: 'Software Security and Testing',            term: 9, type: 'PA', cu: 3 },
  { code: 'D831',  title: 'Introduction to AI and Security',          term: 9, type: 'OA', cu: 2 },
  { code: 'D340',  title: 'Cyber Defense and Countermeasures',        term: 9, type: 'Cert', cu: 4, cert: 'CompTIA CySA+' },
  { code: 'D320',  title: 'Managing Cloud Security',                  term: 9, type: 'OA', cu: 4, cert: 'CCSP (optional voucher)' },
  { code: 'D332',  title: 'Penetration Testing and Vulnerability Analysis', term: 10, type: 'Cert', cu: 4, cert: 'CompTIA PenTest+' },
  { code: 'D833',  title: 'Cybersecurity and Information Assurance Capstone', term: 10, type: 'PA', cu: 4 },
];

// -- Pre-loaded notes from Kaylee's course notes document ------------------

const PRELOADED_NOTES: Record<string, { type: NoteType; content: string }[]> = {
  'PROGRAM': [
    { type: 'general', content: '- 122 total CUs across 38 courses\n- 10 terms of 6 months each\n- Minimum 12 CUs per term required\n- Competency-based: degree earned by demonstrating skills, not seat time\n- Must complete 66.67% of attempted units to maintain SAP\n- First term: must pass at least 3 CUs to maintain financial aid eligibility' },
    { type: 'cert', content: 'CERTS INCLUDED IN BSCSIA 202509:\n- CompTIA A+ Core 1 (D316) -- Webcam/PearsonVUE\n- CompTIA A+ Core 2 (D317) -- Webcam/PearsonVUE\n- CompTIA Network+ (D325) -- Webcam/PearsonVUE\n- CompTIA Security+ (D329) -- TEST CENTER ONLY\n- Axelos ITIL Foundation (D336) -- PeopleSoft\n- CompTIA Project+ (D324) -- Webcam/PearsonVUE\n- LPI Linux Essentials (D281) -- Webcam/PearsonVUE\n- ISC2 SSCP (C845) -- optional voucher, PearsonVUE\n- CompTIA Data+ (D492) -- Webcam/PearsonVUE\n- CompTIA CySA+ (D340) -- Webcam/PearsonVUE\n- ISC2 CCSP (D320) -- optional voucher, PearsonVUE\n- CompTIA PenTest+ (D332) -- Webcam/PearsonVUE' },
    { type: 'cert', content: 'STACKABLE CERTS (earned automatically by CompTIA):\n- CompTIA IT Operations Specialist = A+ Core 1 + A+ Core 2\n- CompTIA Secure Infrastructure Specialist = A+ + Network+\n- CompTIA Network Vulnerability Assessment Professional = Network+ + Security+ + PenTest+\n- CompTIA Network Security Professional = Network+ + Security+ + PenTest+ + CySA+\n- CompTIA Security Analytics Professional = Security+ + CySA+' },
  ],
  'C458': [
    { type: 'pacing', content: '- Speedy: 1 week\n- Steady: 2 weeks\n- Deliberate: 4 weeks' },
    { type: 'structure', content: '- 4 sections each followed by a section test\n- Section 1: Physical Health (11 lessons)\n- Section 2: Nutrition (10 lessons)\n- Section 3: Emotional Health (10 lessons)\n- Section 4: SEL (17 lessons)' },
    { type: 'student_tips', content: '- Email questions to health@wgu.edu -- team-taught, no individual instructor\n- Start by watching the welcome video\n- Access videos and podcasts to reinforce learning' },
    { type: 'competencies', content: '- Identifies factors that influence mental, emotional, and social wellness\n- Identifies the application of core competencies of social and emotional learning\n- Identifies the influence of disease, fitness, and lifestyle on the body\n- Identifies the principles of nutrition and components of a healthy diet' },
  ],
  'C683': [
    { type: 'structure', content: '- 10 lessons to prepare for PA\n- PA: Students conduct a science experiment -- research, design, perform, write a report\n- V4 launched 5/11/26: Enhanced learning resources, improved instructional clarity, updated videos' },
    { type: 'competencies', content: '- Accurately executes the process of scientific inquiry through experimentation in the natural world\n- Draws conclusions based on academic research and scientific inquiry\n- Evaluates academic sources for their credibility and relevance to a chosen research topic' },
  ],
  'D322': [
    { type: 'pacing', content: '- Speedy: 2-3 weeks\n- Steady: 3-4 weeks\n- Deliberate: 4-5 weeks' },
    { type: 'structure', content: '- 8 sections\n- Has a "21 Challenge Plan" to complete the course\n- Questions on comprehensive reviews and readiness quizzes are same as pre-assessment\n- Aim for 85% min score on practice test' },
    { type: 'resources', content: '- Watch "Why/Why not?" video for test-taking strategy\n- Sharepoint site: Great resources -- link in notes\n- Udemy: CompTIA IT Fundamentals ITF+ practice tests' },
    { type: 'competencies', content: '- Describes fundamental data management functions in databases\n- Describes basics of programming languages in software development\n- Describes the role of the IT department in IT infrastructure management, disaster recovery, and business continuity\n- Describes structure, function, and security associated with networks\n- Evaluates ethical concerns in information technology\n- Explains different computer hardware and networking technologies\n- Identifies components of software and its relation to operating systems\n- Identifies computer hardware components' },
  ],
  'D685': [
    { type: 'pacing', content: '- Speedy: 2 weeks or less (10-Day Challenge Plan)\n- Steady: 3 weeks\n- Deliberate: 4 weeks\n- Can complete in 7 days and pass OA on 1st attempt' },
    { type: 'structure', content: '- 4 sections: Generative AI & Prompt Engineering, Crafting Effective Prompts, Prompt Methods & Evaluation, Prompt Engineering Optimization\n- Videos via Pluralsight\n- 2 practice tests at end -- do both and pre-assessment before OA\n- Replaces C844 Emerging Technologies' },
    { type: 'student_tips', content: '- Practice ChatGPT or Gemini with varying levels of detail and observe output differences\n- Use prompt frameworks: Persona/Instruction/Output format for different tasks' },
    { type: 'competencies', content: '- Creates effective prompts with consideration of scope, specificity, and context\n- Evaluates the efficacy of writing different prompts on research outcomes\n- Evaluates the images, texts, and sound of the prompt and adjusts prompts to output relevant results\n- Explains why prompt engineering is necessary' },
  ],
  'D333': [
    { type: 'competencies', content: '- Describes ethical issues regarding data privacy, accuracy, access, and security\n- Explains professional ethical codes and their role in guiding professional behavior\n- Identifies interventions for personal bias and related legal concerns\n- Implements ethical decision-making frameworks in the information age' },
  ],
  'D316': [
    { type: 'pacing', content: '- Accel: 2 weeks\n- Speedy: 3-4 weeks\n- Steady: 4-6 weeks\n- Deliberate: 8 weeks\n- Average time: 8 weeks' },
    { type: 'cert', content: '- Cert: CompTIA A+ Core 1 (220-1101)\n- 90 questions max, 90 minutes\n- Passing score: 675/900\n- Voucher shared with D317 -- one voucher covers BOTH exams\n- Request approval under Assessments -- voucher arrives within 48 hours\n- Use WGU email address for test registration\n- Waiting period between attempts: 0, 14, 14 days' },
    { type: 'structure', content: '- 6 sections: Welcome, Support, Hardware, Networks, Mobile Devices, Printers\n- Some sections include interactive labs\n- No lab orientation in this course -- orientation is in D317' },
    { type: 'student_tips', content: '- Skip PBQs if needed, come back later\n- Test strategy: 1st pass = easy MC, 2nd pass = medium difficulty, Final = PBQs and flagged\n- Never leave a question blank\n- Helpful instructors: Lori Davis, Arthur Moore' },
    { type: 'competencies', content: '- Configures common hardware and software components of mobile devices\n- Configures common hardware in computer systems\n- Configures wired and wireless networks\n- Creates client-side virtualization with cloud computing components\n- Troubleshoots hardware, software, and network issues with best practice methodologies' },
  ],
  'C955': [
    { type: 'pacing', content: '- Speedy: 2 weeks or less\n- Steady: 4-6 weeks\n- Deliberate: 6-10 weeks' },
    { type: 'structure', content: '- 7 modules via MindEdge\n- Includes pre-quiz, readings, examples, key terms, games, flashcards, tests' },
    { type: 'student_tips', content: '- Recommended calculator: TI-30XS Multiview\n- Watch cohort videos first, then read text, do every practice set' },
    { type: 'competencies', content: '- Applies principles and methods of probability-based mathematics to explain and solve problems\n- Applies operations/processes of basic algebra to evaluate quantitative expressions and solve equations\n- Applies operations/processes of fractions, decimals, and percentages\n- Evaluates categorical and quantitative data for a single variable\n- Evaluates the relationship between two quantitative variables through correlation and regression' },
  ],
  'D270': [
    { type: 'pacing', content: '- Speedy: 1-2 weeks\n- Steady: 3-4 weeks\n- Deliberate: 5-6 weeks' },
    { type: 'structure', content: '- 4 sections: Writing an Appropriate Message, Support with Resources, Support with Sources, References\n- About 48 hours to receive evaluator feedback' },
    { type: 'student_tips', content: '- Meet with an instructor at the beginning of the course\n- Email work to selfexpression@wgu.edu for feedback\n- Use WGU Library resources' },
    { type: 'competencies', content: '- Composes a written message with language appropriate for cross-cultural communication\n- Incorporates research to support a position or idea\n- Incorporates self-expression in written communication\n- Researches valid and reliable sources\n- Writes a reference list\n- Writes in a professional manner for a given scenario' },
  ],
  'C957': [
    { type: 'pacing', content: '- Speedy: 2 weeks or less\n- Steady: 4-6 weeks\n- Deliberate: 6-8 weeks' },
    { type: 'structure', content: '- 8 sections covering Function Interpretation through Validity of Models\n- 3 paths: Linear, Topical, Targeted\n- Math taught through real-world applications' },
    { type: 'student_tips', content: '- Whiteboard recommended for practice and the OA\n- Instructors available 7 days/week without appointment at Live Instructor Support' },
    { type: 'competencies', content: '- Analyzes graphical depictions of real-world situations using functional properties\n- Applies exponential functions and their properties to real-world problems\n- Applies linear functions and their properties to real-world problems\n- Applies logistic functions and their properties to real-world problems\n- Applies polynomial functions and their properties to real-world problems\n- Interprets the real-world meaning of various functions\n- Verifies the validity of a given model' },
  ],
  'D317': [
    { type: 'pacing', content: '- Accel: 2 weeks\n- Speedy: 3-4 weeks\n- Steady: 4-6 weeks\n- Average time: 6 weeks' },
    { type: 'cert', content: '- Cert: CompTIA A+ Core 2 (220-1102)\n- 90 questions max, 90 minutes, Passing score: 700/900\n- Voucher shared with D316 -- one voucher covers BOTH exams\n- Waiting period between attempts: 0, 14, 14 days\n- Stackable certs with A+: IT Operations Specialist, Secure Infrastructure Specialist' },
    { type: 'structure', content: '- 6 sections, 13 lessons\n- Sections: Welcome, Support, Operating Systems, Security, Mobile, Using Data Security\n- 6 practice exams + CertMaster Practice exam -- goal: 85% score' },
    { type: 'student_tips', content: '- Reading-based learners: CompTIA ebook + CertMaster Perform\n- Video-based learners: Udemy + Percipio\n- Helpful instructors: Lori Davis, Arthur Moore' },
    { type: 'competencies', content: '- Identifies operating systems and their configurations\n- Identifies remote access technology solutions\n- Identifies scripting basics\n- Implements basic disaster recovery and business continuity procedures\n- Implements security principles across devices and networks\n- Troubleshoots software, security, and malware issues' },
  ],
  'D827': [
    { type: 'structure', content: '- 12 sections via Zybooks\n- Labs in sections 5, 7, 9 -- info will reappear on OA\n- More interactive than old course (labs, animations)' },
    { type: 'student_tips', content: '- Pre-assessment is NOT reflective of OA -- pre is definition-driven; OA is scenario-based\n- Pay special attention to the CIA triad\n- Complete optional items -- helps with future coursework' },
    { type: 'resources', content: '- Quizlet: D827 Pre Exam flash cards\n- Quizlet: D827 Practice Exam 1 and 2\n- cyberseek.org -- good for exploring cyber careers' },
    { type: 'competencies', content: '- Explains how human, organizational, and societal factors impact cybersecurity\n- Identifies threats, principles, standards, and best practices related to connection and system security\n- Identifies threats, principles, standards, and best practices related to data security\n- Identifies threats, principles, standards, and best practices related to software and component security' },
  ],
  'D315': [
    { type: 'structure', content: '- 3 sections: Intro to Networking Concepts, Intro to Network Security, Network Security Options\n- Has pre-assessment and WGU OA' },
    { type: 'resources', content: '- OSI Layers Quiz -- ExamCompass\n- Wireless Networking Quiz -- ExamCompass\n- Network Devices Quiz -- ExamCompass\n- Quizlet study sets available' },
    { type: 'competencies', content: '- Applies network security concepts for business continuity, data access, and confidentiality\n- Identifies basic network systems and concepts related to networking technologies\n- Identifies solutions for compliance with security guidance' },
  ],
  'D265': [
    { type: 'pacing', content: '- 1-2 weeks if highly motivated' },
    { type: 'structure', content: '- 5 sections: Evaluating Arguments, Source Credibility, Identifying Bias, Making a Claim, Review with Feedback' },
    { type: 'student_tips', content: '- Do not try to overcomplicate the PA tasks\n- SWAY walkthrough available including 10-min video sample\n- Template available for the PA' },
    { type: 'competencies', content: '- Evaluates bias and its impact\n- Evaluates evidence based on source credibility\n- Evaluates the quality of an argument\n- Makes claims based on evidence' },
  ],
  'D325': [
    { type: 'pacing', content: '- Speedy: 4 weeks or less\n- Steady: 6-8 weeks\n- Deliberate: 8-12 weeks\n- Average time: 9 weeks' },
    { type: 'cert', content: '- Cert: CompTIA Network+ (N10-009)\n- 90 questions max, 90 minutes, Passing score: 720/900\n- Voucher: 80%+ on CertMaster Perform OR 85%+ on Jason Dion Practice Quizzes 1 or 2\n- Waiting period: 0, 14, 14 days\n- Stackable certs: IT Operations Specialist, Secure Infrastructure Specialist (with A+)' },
    { type: 'structure', content: '- 5 sections, 14 modules\n- Section 1: Hardware and Topologies (Modules 1-3)\n- Section 2: Network Services & Configuration (Modules 4-6)\n- Section 3: Managing Networks (Modules 7-9)\n- Section 4: Secure Networks (Modules 10-12)\n- Section 5: Remote Access & Cloud Technologies (Modules 13-14)' },
    { type: 'student_tips', content: '- 6-week pacing guide in WGU Connect\n- Use Jason Dion practice tests IN ADDITION to CompTIA practice tests\n- Great instructors: Ken Aitken, Lori Davis, Josh Dunn' },
    { type: 'competencies', content: '- Configures a network infrastructure\n- Configures networking components\n- Implements network security techniques\n- Optimizes network operations for availability, performance, and security\n- Troubleshoots network issues' },
  ],
  'D268': [
    { type: 'pacing', content: '- Speedy: 3 weeks or less\n- Steady: 4-6 weeks\n- Deliberate: 6-10 weeks' },
    { type: 'structure', content: '- 3 sections: Communicating in Diverse Groups, Art of Conflict Management, Influencing Others\n- Task 3 requires multimedia presentation with video -- can use voiceover' },
    { type: 'competencies', content: '- Implements appropriate communication styles based on audience and setting\n- Uses communication strategies for managing conflict\n- Uses communication strategies to influence others' },
  ],
  'D336': [
    { type: 'pacing', content: '- Average time: 6 weeks' },
    { type: 'cert', content: '- Cert: Axelos ITIL Foundation\n- Taken through PeopleSoft (not PearsonVUE)\n- 40 questions, 60 minutes, Passing score: 65% (26/40)\n- Foundation cert is lifetime -- no renewal required\n- No waiting period between attempts: 0, 5, 5 days' },
    { type: 'structure', content: '- 6 sections: Course Overview, Key Concepts, Four Dimensions, Guiding Principles, Key ITIL Practices, Exam Readiness\n- 6 full-length practice tests + CyberVista practice exam in last section' },
    { type: 'competencies', content: '- Applies ITIL concepts, core components, principles, and models of service management\n- Applies the ITIL six activities of the service value chain' },
  ],
  'C963': [
    { type: 'pacing', content: '- Per R. Boyce: 3 weeks max; can be done in a weekend' },
    { type: 'structure', content: '- 5 sections: Constitutional Democracy, Structure of US Government, Political Participation, Civil Liberties, Public Opinion\n- Change from OA to PA effective 6/3/25 -- 3 tasks' },
    { type: 'resources', content: '- WGU Connect: recorded videos and audio podcasts\n- Cohorts: 3 Tasks in 30 minutes' },
    { type: 'competencies', content: '- Describes the influence of competing political ideologies on the development of the US government\n- Examines the influence of political parties, citizens, and non-governmental organizations on elections\n- Examines the influence of media, public opinion, and political discourse on American democracy\n- Examines the struggle to balance individual liberty, public order, and states rights\n- Explains how the structure and powers of the US government interact to form public policy' },
  ],
  'D420': [
    { type: 'pacing', content: '- Speedy: 10 days or less\n- Steady: 2-3 weeks\n- Deliberate: 3-5 weeks\n- Updated 2/17/26: updated OA and Pre-assessment' },
    { type: 'structure', content: '- 10 modules via Zybooks\n- Formula sheet IS provided on OA\n- Instructors do live events through the week -- no appointment necessary' },
    { type: 'student_tips', content: '- Do NOT approach as a math course -- it is symbol recognition and patterns\n- YouTube videos helpful: Kimberly Brehm (#1-21)\n- Most students need 2 attempts on OA' },
    { type: 'competencies', content: '- Evaluates the truth of statements using proofs and the principles of deductive logic\n- Minimizes circuits using Boolean algebra and Boolean functions' },
  ],
  'D329': [
    { type: 'pacing', content: '- Speedy: 3 weeks or less\n- Steady: 4-8 weeks\n- Deliberate: 9-12 weeks\n- Average time: 9 weeks' },
    { type: 'cert', content: '- Cert: CompTIA Security+ (SY0-701)\n- 90 questions max, 90 minutes, Passing score: 750/900\n- Must take at a test center -- whiteboard and markers provided\n- 8-week pacing guide in instructor welcome email\n- Waiting period: 0, 14, 14 days' },
    { type: 'structure', content: '- 8 sections, 16 lessons\n- Aim for 90% on all labs, quizzes, practice tests\n- Course rhythm: bounce between WGU materials and CompTIA (videos, labs, PBQs)' },
    { type: 'student_tips', content: '- Test is difficult because of TIME limitation, not content\n- Skip simulations and do at end OR do them quickly\n- Read each question thoroughly to know exactly what is being asked' },
    { type: 'competencies', content: '- Analyzes information security controls, governance, risk, and compliance\n- Designs security solutions for enterprise infrastructures and architectures\n- Executes operations and incident response with tools, policies, forensics, and mitigation techniques\n- Identifies threats, attacks, and vulnerabilities to organizational security\n- Implements security solutions across hardware, applications, and network services' },
  ],
  'D828': [
    { type: 'pacing', content: '- Speedy: 3 weeks or less\n- Steady: 4-5 weeks\n- Deliberate: 6-7 weeks' },
    { type: 'structure', content: '- 22 sections via Zybooks\n- Covers: Governance/Risk/Compliance, Cybersecurity Landscape, NIST frameworks, Privacy laws, Auditing, AI in Cyber\n- Has 1 lab and 4 case studies\n- Video from section 21.2 is crucial to watch BEFORE completing Task 2\n- Task 1: Framework is not specifically identified -- student must infer' },
    { type: 'student_tips', content: '- Per Zach Vega: Join WGU Connect, read rubrics, use template\n- Watch all videos (some are over an hour long)' },
    { type: 'competencies', content: '- Analyzes applicable regional, national, international, and industry legal requirements\n- Discusses the implications of ethical issues for specific cybersecurity actions\n- Explains the fundamental standards, frameworks, and practices of data privacy and protection\n- Outlines a security awareness training and education (SATE) program' },
  ],
  'D829': [
    { type: 'pacing', content: '- Speedy: 3 weeks or less\n- Steady: 4-5 weeks\n- Deliberate: 5-6 weeks' },
    { type: 'prereqs', content: '- Complete AFTER: D316, D317, D315, D325, D329' },
    { type: 'structure', content: '- 21 sections via Zybooks + Autopsy\n- PA requires screenshots uploaded in specific manner\n- To meet student ID requirement: open NotePad with "My student number is [#]" in each screenshot' },
    { type: 'student_tips', content: '- Do not just describe what the tool shows -- EXPLAIN WHY IT MATTERS\n- Focus on interpreting findings and connecting back to investigation scenario\n- Read WGU Connect discussions and watch resources tab video BEFORE starting' },
    { type: 'competencies', content: '- Analyzes gathered evidence with forensic tools in alignment with investigation processes\n- Collects forensic evidence from deleted files and artifacts\n- Creates incident reports communicating the conclusions of a forensic investigation\n- Identifies laws, rules, standards, policies, and best practices related to digital forensics' },
  ],
  'C845': [
    { type: 'pacing', content: '- Speedy pace: 4 weeks or less\n- 3 PA tasks to pass course (~2-3 pages per PA)' },
    { type: 'cert', content: '- Optional SSCP cert (ISC2 SSCP) voucher after passing PAs -- good for 1 year\n- Exam: 125 questions, 3 hours, Passing score: 700/1000\n- Computer adaptive testing (CAT format), PearsonVUE only\n- Renewal: Every 3 years -- requires 60 CPE credits\n- Students identified as "SSCP Associate" until graduation/experience requirement met\n- After finishing course: lose course access but keep LinkedIn Learning + WGU Library\n- Plan to take cert test within the SAME TERM (optional)' },
    { type: 'structure', content: '- 7 domains: Security Concepts, Access Controls, Risk ID/Monitoring/Analysis, Incident Response, Cryptography, Network Security, Systems Security\n- Mike Chapple YouTube videos available' },
    { type: 'student_tips', content: '- Per Justin Moss: Overdo the risk definition on PAs\n- Per Zach Vega: Use WGU Connect recorded cohorts\n- Per Chad Kliewer: Read domains 1-3 -> write Task 1, read 4-5 -> write Task 2, read 6-7 -> write Task 3' },
    { type: 'competencies', content: '- Defends the security of a network by maintaining CIA of information transmitted over communication networks\n- Evaluates cryptographic systems and operations to protect data security\n- Evaluates security concerns with countermeasures to guard against malicious activity\n- Evaluates security incident handling plans to protect and preserve organization assets\n- Manages control access to privileged, confidential, or proprietary resources\n- Proposes security risk mitigation processes to identify, evaluate, prioritize, and prevent threats' },
  ],
  'D324': [
    { type: 'pacing', content: '- Speedy: 3 weeks or less\n- Steady: 6-8 weeks\n- Deliberate: 8-12 weeks\n- Average time: 8 weeks' },
    { type: 'cert', content: '- Cert: CompTIA Project+ (PK0-005)\n- 95 questions max, 90 minutes, Passing score: 710/900\n- Calculator and whiteboard/paper provided during exam\n- Renewal: Certs earned BEFORE Oct 1, 2025 = good for life; ON or AFTER = expires every 3 years\n- Waiting period: 0, 14, 14 days' },
    { type: 'structure', content: '- 4 parts, 14 lessons linked to CertMaster\n- 9 Performance-based Questions/tasks\n- Course rhythm: bounce between WGU materials and CompTIA\n- Aim for 90%+ on quizzes, labs, practice tests' },
    { type: 'student_tips', content: '- Course is HEAVY on terminology -- make flashcards or take notes\n- Per Justin Moss: CompTIA practice tests more helpful than Jason Dion\n- Per Zach Vega: Use CompTIA approach to answer -- what CompTIA says vs. what YOU think' },
    { type: 'competencies', content: '- Applies communication methods and change control processes within a project\n- Determines requirements of a project management plan\n- Identifies project factors, constraints, and risk strategies' },
  ],
  'D421': [
    { type: 'pacing', content: '- Speedy: 10 days or less\n- Steady: 2-3 weeks\n- Deliberate: 3-5 weeks\n- Updated 2/17/26' },
    { type: 'structure', content: '- 9 modules: Working with Sets, Higher Set Operations, Overview of Functions, Binary Relations, Order Relations, N-ary Relations\n- NO formula sheets allowed -- must memorize' },
    { type: 'competencies', content: '- Analyzes mathematical problems using relations and directed graphs\n- Analyzes relationships between sets and functions' },
  ],
  'D422': [
    { type: 'pacing', content: '- Speedy: 10 days or less\n- Steady: 2-3 weeks\n- Deliberate: 3-5 weeks\n- Updated 2/17/26' },
    { type: 'structure', content: '- 10 modules: Algorithm Structures through Math Foundations of Encryption\n- NO formula sheets allowed -- must memorize\n- Prepares for D830 Intro to Cryptography' },
    { type: 'competencies', content: '- Analyzes linear algorithms and associated big-O estimates\n- Analyzes the use of number theory in cryptography' },
  ],
  'D830': [
    { type: 'pacing', content: '- 4-6 weeks to complete\n- 30-day pacing guide in WGU Connect Resources' },
    { type: 'prereqs', content: '- Complete AFTER: D316, D317, D315, D325, D329' },
    { type: 'structure', content: '- 12 sections via Zybooks\n- Has pre-assessment (must complete to unlock OA), OA with 30 questions, AND 2 PAs (lab + written task)\n- PA scenario assigned based on student last name' },
    { type: 'competencies', content: '- Analyzes principles and operations of cryptographic algorithms and protocols\n- Explains foundational cryptography concepts and the elements of a cryptographic system\n- Explains how cryptography frameworks inform alignment of organizational and information security guidelines\n- Implements encryption methods with symmetric and asymmetric algorithms' },
  ],
  'D832': [
    { type: 'pacing', content: '- Course can be completed in a week\n- Speedy: 2 weeks or less\n- Steady: 4 weeks' },
    { type: 'structure', content: '- 28 parts via Zybooks\n- PA: 5 case studies, 4 tasks, focused on incident response\n- Running case study throughout course prepares for PA\n- Forage website: Sign in with WGU email, complete tasks, download certificate' },
    { type: 'student_tips', content: '- WGU Connect "All in One Guide" -- very helpful\n- Some videos marked "optional" -- still worth watching' },
    { type: 'competencies', content: '- Develops security incident response plans aligned to organization security goals\n- Recommends changes to established security management programs in response to cyber incidents\n- Recommends modifications to established information security governance\n- Recommends risk mitigation strategies relevant to an organization information security program\n- Recommends strategies for meeting regulatory compliance within an organization' },
  ],
  'D278': [
    { type: 'pacing', content: '- Per Doug: typical pacing is 4 weeks' },
    { type: 'structure', content: '- 11 sections via Zybooks\n- Sections 1-4: Intro, Variables, Branches, Loops\n- Sections 5-11: Arrays, Functions, Algorithms, Design Process, Troubleshooting\n- Includes labs throughout' },
    { type: 'competencies', content: '- Explains the logic and outcome of simple algorithms\n- Identifies scripts for computer program requirements\n- Uses fundamental programming elements as part of common computer programming tasks' },
  ],
  'D281': [
    { type: 'pacing', content: '- Speedy: 4 weeks or less\n- Steady: 5 weeks\n- Deliberate: 6 weeks\n- Average time: 6 weeks' },
    { type: 'cert', content: '- Cert: Linux Professional Institute (LPI) Linux Essentials (010-160)\n- 40 questions, 60 minutes, Passing score: 500/800\n- Renewal: Not required -- lifetime certification\n- Waiting period: 7, 30, 30 days' },
    { type: 'structure', content: '- 3 sections: Welcome, Linux Essentials (8 lessons -- Lessons 2 and 8 are LONG), Labs with virtual machine\n- Critical areas: Topics 2, 3, and 5' },
    { type: 'competencies', content: '- Develops resources for data access and security\n- Identifies the fundamentals of open-source software' },
  ],
  'D426': [
    { type: 'pacing', content: '- Speedy: 4 weeks or less\n- Steady: 5-6 weeks\n- Deliberate: 7-8 weeks' },
    { type: 'structure', content: '- 5 sections via Zybooks: Intro to Databases, Database Management (10 lessons, 8 labs), Complex Queries, Database Design, Indexes' },
    { type: 'student_tips', content: '- Go through material MULTIPLE TIMES and do coding practices more than once\n- Partner with instructors' },
    { type: 'competencies', content: '- Defines primary and foreign keys in data normalization\n- Determines how to run queries for creation and manipulation of data in relational databases\n- Explains attributes of databases, tables, and SQL commands' },
  ],
  'D522': [
    { type: 'structure', content: '- V1: 15 sections via Zybooks -- covers file handling, log analysis, subprocesses\n- V2 (effective 6/22/26): 3 sections, OA replaced by PA, whole new content\n- V2 Task 1: DNS outage resolution using Python automation\n- V2 Task 2: Monitoring solution for DNS issues with alerting and ticketing' },
    { type: 'student_tips', content: '- D278 helps students with zero coding experience\n- Per Cyber Group: Definitely take D522 BEFORE D385!' },
    { type: 'competencies', content: '- Applies Python principles and syntax to manage variables, data structures, and operators\n- Creates Python scripts using control structures to automate system tasks\n- Integrates Python scripts, modules, packages, and libraries to automate networking tasks' },
  ],
  'D492': [
    { type: 'pacing', content: '- Speedy: 4 weeks max\n- Steady: 5-7 weeks\n- Deliberate: 8-10 weeks' },
    { type: 'cert', content: '- Cert: CompTIA Data+ (DA0-001)\n- 90 questions max, 90 minutes, Passing score: 675/900\n- No calculator allowed -- do work by hand\n- Waiting period: 0, 14, 14 days\n- "Easiest cert test" compared to A+ per instructors\n- 5-10% of questions are poorly worded -- best guess' },
    { type: 'structure', content: '- 6 sections, 18-19 lessons via CertMaster\n- 20% course overlap with D426 Data Mgmt Foundations' },
    { type: 'student_tips', content: '- Use Course Materials + Udemy practice tests\n- Mike Chapple LinkedIn Learning: Data+ Cert Prep' },
    { type: 'competencies', content: '- Applies appropriate data acquisition and manipulation techniques to address business data requirements\n- Applies basic concepts to analyze data types and data structures\n- Applies data analysis techniques and tools to address a business need\n- Applies data management concepts to ensure the accuracy and quality of data\n- Applies data visualization techniques to communicate a business need' },
  ],
  'D385': [
    { type: 'pacing', content: '- Per Doug: 4 weeks\n- Complete AFTER D522 Python' },
    { type: 'prereqs', content: '- Complete AFTER: D522 Python' },
    { type: 'structure', content: '- 4 sections: Overview, Application & Network Logs, Security Authentication, Mitigation Solutions\n- Look for "Practice Area" at end of sections -- has practice labs that mirror assessments\n- Be careful with spacing -- affects coding accuracy' },
    { type: 'student_tips', content: '- Pre-assessment will NOT give helpful info for the coding problem section\n- Per Lindsey Caraher: Task 1 "Summarize 5 distinct issues" -- run vulnerabilities report in Python project\n- Email instructor group: cmsoftware@wgu.edu' },
    { type: 'competencies', content: '- Configures security authentication for REST and APIs\n- Develops mitigation solutions for security vulnerabilities\n- Evaluates application and network logs for performance, availability, and security vulnerabilities' },
  ],
  'D831': [
    { type: 'structure', content: '- 14 sections via Zybooks\n- All reading and charts -- each part is short (1 page or less)\n- Includes knowledge checks and labs throughout\n- OA course' },
    { type: 'competencies', content: '- Describes the types of artificial intelligence for decision-making in real-world applications\n- Explains best practices for managing secure AI systems within an organization\n- Explains how the collection, wrangling, and cleaning of data impacts AI/ML models' },
  ],
  'D340': [
    { type: 'pacing', content: '- Speedy: 3-4 weeks\n- Steady: 4-8 weeks\n- Deliberate: 8-10 weeks\n- Average time: 9 weeks' },
    { type: 'cert', content: '- Cert: CompTIA CySA+ (CS0-003)\n- 85 questions max, 165 minutes, Passing score: 750/900\n- Goal: engage in all course materials, earn 90%+ on all practice sets\n- CertMaster Practice Test can be taken 2x -- different test generated on 2nd attempt\n- Waiting period: 0, 14, 14 days\n- Stackable cert earned: Security Analytics Professional' },
    { type: 'prereqs', content: '- Complete AFTER: D316, D317, D315, D325, D329, D829, C845, D830, D832, D522' },
    { type: 'structure', content: '- 4 sections via CertMaster\n- Section 1: Threats and Security Intelligence\n- Section 2: Apply Security Solutions\n- Section 3: Demonstrating Incident Response Communication\n- Section 4: Cert Exam Practice' },
    { type: 'student_tips', content: '- Udemy: Jason Dion Complete Course and Practice Exams (7 total)\n- TryHackMe: free version -- "Learn" tab and "Paths" tab\n- TryHackMe reduced cost with WGU email: $10/month' },
    { type: 'competencies', content: '- Applies controls and procedures for software and system security\n- Applies improvement techniques and automation based on system monitoring and threat hunting\n- Applies incident response procedures based on digital forensic analysis\n- Applies security concepts to risk mitigation with regards to privacy and protection\n- Manages security testing and response in defense of organizational threats and vulnerabilities' },
  ],
  'D320': [
    { type: 'pacing', content: '- Speedy: 4 weeks or less\n- Steady: 7 weeks\n- Deliberate: 7-8 weeks\n- Average time: 6 weeks' },
    { type: 'cert', content: '- Optional CCSP (ISC2) voucher after passing OA -- only 1 voucher available\n- Exam: 150 questions, 4 hours, Passing score: 700/1000\n- Computer adaptive testing (CAT format)\n- Renewal: Every 3 years -- requires 90 CPE credits\n- 5 years of paid work experience required for full CCSP designation' },
    { type: 'prereqs', content: '- Complete AFTER: D316, D317, D315, D325, D329, D829, C845, D830, D832, D522' },
    { type: 'structure', content: '- 7 sections, each with learning objectives, readings, knowledge check, summary\n- Lessons 1-10: Read CCSP Official Study Guide\n- Lessons 11-12: Review 6 video courses from LinkedIn Learning\n- Lessons 5 and 6 tend to require extra time' },
    { type: 'competencies', content: '- Conducts risk analysis and risk management in alignment with disaster recovery and business continuity plans\n- Identifies legal, compliance, and ethical concerns within a cloud environment\n- Identifies security policies and procedures for cloud applications\n- Implements operational capabilities, procedures, and training in relation to organizational needs\n- Implements secure solutions in cloud service models\n- Safeguards cloud data with identity and access management' },
  ],
  'D332': [
    { type: 'pacing', content: '- Speedy: 4 weeks\n- Steady: 4-6 weeks\n- Deliberate: 6-8 weeks\n- Average time: 7 weeks\n- 68% pass rate at WGU' },
    { type: 'cert', content: '- Cert: CompTIA PenTest+ (PT0-003)\n- 90 questions max, 165 minutes, Passing score: 750/900\n- Difficulty: Intermediate -- best with 3-4 years industry experience\n- Waiting period: 0, 14, 14 days\n- WGU subsidized cost vs retail -- check with instructor\n- Cumulative: Security+, Linux+, CySA+ content\n- Stackable certs: Network Vulnerability Assessment Professional, Network Security Professional' },
    { type: 'prereqs', content: '- Complete AFTER: D316, D317, D315, D325, D329, D829, C845, D830, D832, D522, D385, D831, D340, D320' },
    { type: 'structure', content: '- 10 sections + Exam Readiness via CompTIA platform\n- 37 labs total -- complete 95% with 90%+ scores\n- Students must know Linux command lines\n- VOUCHER REQUIREMENTS (effective Feb 2026):\n  1. Live call with any D332 instructor (required before voucher)\n  2. CertMaster Perform Labs: 90%+ overall completion\n  3. CertMaster Perform A.2.6 full-length practice exam: 90%+' },
    { type: 'student_tips', content: '- Start with CertMaster material and labs for foundation\n- Watch Hank Hackerson PenTest playlist on YouTube\n- TryHackMe PenTest+ pathway (HTTP and nmap rooms)\n- All 6 Jason Dion PenTest+ 003 practice exams on Udemy (aim for 80%+)\n- Mental shift: from defense to offense' },
    { type: 'competencies', content: '- Defines the scope and planning for procurement of penetration testing engagements\n- Develops penetration testing techniques in exploitation of physical, digital, and social vulnerabilities\n- Performs cyber reconnaissance techniques for information gathering and vulnerability identification\n- Reports the results of cybersecurity assessments with recommended actions\n- Simulates attacks and responses on an organization security infrastructure' },
  ],
  'D833': [
    { type: 'pacing', content: '- 4-6 weeks to complete\n- FINAL course in program -- should be completed LAST\n- V2 rolls out 6/29/26' },
    { type: 'structure', content: '- 3 tasks:\n  Task 1: Formal Proposal/Topic Selection (requires instructor approval)\n  Task 2: Executive Summary/Project Proposal (has peer review -- can take up to 7 days)\n  Task 3: Technical Report/Post-implementation Report\n- Must be written in proper APA format\n- Templates available' },
    { type: 'student_tips', content: '- Join WGU Connect\n- Access Capstone Excellence Archive for examples\n- If former Capstone (C769) is completed, student does NOT do this one' },
    { type: 'competencies', content: '- Creates a project proposal to convince stakeholders to implement the security solution\n- Creates a technical report for a fully functional system to solve real-world scenarios\n- Creates an executive summary of a security solution directed to IT and business professionals' },
  ],
};


// __ Note type labels ____________________________________________________

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  general:      '[General]',
  pacing:       '[Pacing]',
  structure:    '[Course Structure]',
  cert:         '[Cert Info]',
  student_tips: '[Student Tips]',
  resources:    '[Resources]',
  prereqs:      '[Prerequisites]',
  competencies: '[Competencies]',
};

const NOTE_TYPE_COLORS: Record<NoteType, string> = {
  general:      'var(--muted)',
  pacing:       'var(--green)',
  structure:    'var(--purple)',
  cert:         '#d97706',
  student_tips: 'var(--amber)',
  resources:    '#0891b2',
  prereqs:      'var(--red)',
  competencies: '#0f766e',
};

// __ AI document scanner _________________________________________________

async function scanDocumentWithAI(
  fileText: string,
  courses: typeof COURSES,
): Promise<{ course_code: string; note_type: NoteType; content: string }[]> {
  const courseList = courses
    .filter(c => c.code !== 'PROGRAM')
    .map(c => `${c.code}: ${c.title}`)
    .join('\n');

  const prompt = `You are a course notes assistant for a WGU BSCSIA student's study app.

Here is a list of all courses in the program:
${courseList}

The student has uploaded a document. Read it carefully and extract useful study notes from it.
For each piece of useful information, determine:
1. Which course it belongs to (use the exact course code like D325, C458, etc.)
2. Which category it fits (pacing, structure, cert, student_tips, resources, prereqs, competencies, or general)
3. Write a clean, concise version of the note in the same style as the existing notes: short, bullet-pointed, easy to scan. Use "- " for bullets.

Return ONLY valid JSON array, no markdown, no explanation. Format:
[
  {"course_code": "D325", "note_type": "student_tips", "content": "- Tip here\n- Another tip"},
  ...
]

If you cannot confidently assign something to a specific course, use course_code "PROGRAM".
Only include genuinely useful study notes — skip filler text, headers, and repetitive content.

Document content:
${fileText.slice(0, 6000)}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  const text = data.content?.[0]?.text ?? '[]';
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// __ Main Component ______________________________________________________

export default function CourseNotes() {
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [notes, setNotes]               = useState<CourseNote[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [newType, setNewType]           = useState<NoteType>('student_tips');
  const [newContent, setNewContent]     = useState('');
  const [saving, setSaving]             = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editContent, setEditContent]   = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterType, setFilterType]     = useState<NoteType | 'all'>('all');

  // Document upload state
  const [showUpload, setShowUpload]       = useState(false);
  const [uploadFile, setUploadFile]       = useState<File | null>(null);
  const [uploadStatus, setUploadStatus]   = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [uploadLog, setUploadLog]         = useState<string[]>([]);

  const selectedCourse = COURSES.find(c => c.code === selectedCode);

  const loadNotes = useCallback(async (code: string) => {
    if (!supabase || !code) return;
    setLoading(true);
    const { data } = await supabase
      .from('course_notes')
      .select('*')
      .eq('course_code', code)
      .order('note_type')
      .order('created_at');
    setNotes((data as CourseNote[]) ?? []);
    setLoading(false);
  }, []);

  const seedPreloaded = useCallback(async (code: string) => {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;
    const { data: existing } = await supabase
      .from('course_notes').select('id').eq('course_code', code).limit(1);
    if (existing && existing.length > 0) return;
    const seeded = PRELOADED_NOTES[code];
    if (!seeded || seeded.length === 0) return;
    await supabase.from('course_notes').insert(
      seeded.map(n => ({
        user_id: userId,
        course_code: code,
        note_type: n.type,
        content: n.content,
      }))
    );
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    (async () => {
      await seedPreloaded(selectedCode);
      await loadNotes(selectedCode);
    })();
  }, [selectedCode, loadNotes, seedPreloaded]);

  async function handleAdd() {
    if (!supabase || !newContent.trim() || !selectedCode) return;
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) { setSaving(false); return; }
    await supabase.from('course_notes').insert({
      user_id: userId,
      course_code: selectedCode,
      note_type: newType,
      content: newContent.trim(),
    });
    setNewContent('');
    setShowAdd(false);
    await loadNotes(selectedCode);
    setSaving(false);
  }

  async function handleEdit(note: CourseNote) {
    if (!supabase) return;
    await supabase.from('course_notes').update({
      content: editContent,
      updated_at: new Date().toISOString(),
    }).eq('id', note.id);
    setEditingId(null);
    await loadNotes(selectedCode);
  }

  async function handleDelete(id: string) {
    if (!supabase || !confirm('Delete this note?')) return;
    await supabase.from('course_notes').delete().eq('id', id);
    await loadNotes(selectedCode);
  }

  // __ Document upload + AI scan __________________________________________
  async function handleDocumentScan() {
    if (!uploadFile || !supabase) return;
    setUploadStatus('scanning');

    const fileName = uploadFile.name.toLowerCase();
    const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');
    const isPdf  = fileName.endsWith('.pdf') || uploadFile.type === 'application/pdf';

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) { setUploadStatus('error'); return; }

      let fileText = '';

      if (isDocx) {
        // .docx is a ZIP/XML — we can extract raw text from the XML inside
        setUploadLog(['Reading .docx file...']);
        try {
          const arrayBuffer = await uploadFile.arrayBuffer();
          // Use JSZip-style manual extraction — get word/document.xml text
          const uint8 = new Uint8Array(arrayBuffer);
          const textDecoder = new TextDecoder('utf-8', { fatal: false });
          const raw = textDecoder.decode(uint8);
          // Extract text between XML tags — strip all XML tags
          const xmlMatch = raw.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
          if (xmlMatch && xmlMatch.length > 0) {
            fileText = xmlMatch
              .map(m => m.replace(/<[^>]+>/g, ''))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
          } else {
            // Fallback: extract any readable ASCII text from the binary
            fileText = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
          }
          if (fileText.length < 50) {
            setUploadLog(['⚠️ Could not extract text from .docx. Try saving as .txt or .pdf first.']);
            setUploadStatus('error');
            return;
          }
        } catch {
          setUploadLog(['⚠️ Could not read .docx file. Try saving as .txt or copy-pasting the content into a .txt file.']);
          setUploadStatus('error');
          return;
        }
      } else if (isPdf) {
        setUploadLog(['Reading PDF... (tip: text-based PDFs work best)']);
        try {
          fileText = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
              const result = e.target?.result as string ?? '';
              // Extract readable text from PDF binary
              const textMatches = result.match(/\(([^\)]{2,})\)/g);
              if (textMatches && textMatches.length > 20) {
                resolve(textMatches.map(m => m.slice(1,-1)).join(' '));
              } else {
                // Try plain text extraction
                resolve(result.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim());
              }
            };
            reader.onerror = reject;
            reader.readAsBinaryString(uploadFile);
          });
        } catch {
          setUploadLog(['⚠️ Could not read PDF. Try copying the text into a .txt file instead.']);
          setUploadStatus('error');
          return;
        }
      } else {
        // Plain text / markdown / csv
        setUploadLog(['Reading document...']);
        fileText = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target?.result as string ?? '');
          reader.onerror = reject;
          reader.readAsText(uploadFile);
        });
      }

      if (!fileText || fileText.trim().length < 30) {
        setUploadLog(['⚠️ File appears empty or unreadable. Best results: save as .txt or .md first.']);
        setUploadStatus('error');
        return;
      }

      setUploadLog(prev => [...prev, `Extracted ${fileText.length.toLocaleString()} characters. Sending to AI...`]);

      const extracted = await scanDocumentWithAI(fileText, COURSES);

      if (extracted.length === 0) {
        setUploadLog(prev => [...prev, 'No notes found in this document. Try a different file.']);
        setUploadStatus('error');
        return;
      }

      setUploadLog(prev => [...prev, `Found ${extracted.length} notes across ${new Set(extracted.map(e => e.course_code)).size} courses. Saving...`]);

      // Save each extracted note, but first check for duplicates by content
      let saved = 0;
      for (const note of extracted) {
        const validCode = COURSES.find(c => c.code === note.course_code)?.code ?? 'PROGRAM';
        // Check if a very similar note already exists
        const { data: existing } = await supabase
          .from('course_notes')
          .select('id, content')
          .eq('course_code', validCode)
          .eq('note_type', note.note_type)
          .eq('user_id', userId);

        // Check for near-duplicate (first 80 chars match)
        const isDuplicate = existing?.some(e =>
          e.content.slice(0, 80).toLowerCase() === note.content.slice(0, 80).toLowerCase()
        );

        if (!isDuplicate) {
          await supabase.from('course_notes').insert({
            user_id: userId,
            course_code: validCode,
            note_type: note.note_type,
            content: note.content.trim(),
          });
          saved++;
        }
      }

      setUploadLog(prev => [
        ...prev,
        `Saved ${saved} new notes (${extracted.length - saved} duplicates skipped).`,
        'Done! Select a course to see your new notes.',
      ]);
      setUploadStatus('done');
      setUploadFile(null);

      // Refresh current course if open
      if (selectedCode) await loadNotes(selectedCode);

    } catch (err) {
      setUploadLog(prev => [...prev, `Error: ${String(err)}`]);
      setUploadStatus('error');
    }
  }

  const filtered = notes.filter(n => {
    const matchType = filterType === 'all' || n.note_type === filterType;
    const matchSearch = !searchTerm || n.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchType && matchSearch;
  });

  const grouped = filtered.reduce<Record<NoteType, CourseNote[]>>((acc, note) => {
    const t = note.note_type as NoteType;
    if (!acc[t]) acc[t] = [];
    acc[t].push(note);
    return acc;
  }, {} as Record<NoteType, CourseNote[]>);

  const termGroups = Array.from({ length: 11 }, (_, i) => i).map(term => ({
    term,
    courses: COURSES.filter(c => c.term === term),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Course Notes</h1>
          <p>BSCSIA 202509 -- reference notes by course</p>
        </div>
        <button className="btn primary" onClick={() => { setShowUpload(v => !v); setUploadStatus('idle'); setUploadLog([]); setUploadFile(null); }}>
          <Upload size={14} /> Scan Document
        </button>
      </div>

      {/* ── Document Upload Panel ── */}
      {showUpload && (
        <section className="panel" style={{ borderLeft: '4px solid var(--purple)', marginBottom: 14 }}>
          <div className="panel-head">
            <h2><Upload size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Scan a Document into Notes</h2>
            <button className="btn ghost" onClick={() => { setShowUpload(false); setUploadStatus('idle'); setUploadLog([]); }}>
              <X size={13} /> Close
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Upload a study guide or document. AI will read it, figure out which courses it relates to, and save the key info directly into your notes — formatted short and clean.
            <br /><strong>Best formats: .txt or .md</strong> (copy/paste from Word/PDF into Notepad and save as .txt for most reliable results). .docx and .pdf are supported but may have limited extraction.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="file"
              accept=".txt,.md,.pdf,.doc,.docx,.csv"
              onChange={e => { setUploadFile(e.target.files?.[0] ?? null); setUploadStatus('idle'); setUploadLog([]); }}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button
              className="btn primary"
              onClick={handleDocumentScan}
              disabled={!uploadFile || uploadStatus === 'scanning'}
            >
              {uploadStatus === 'scanning'
                ? <><Loader size={13} className="spin" /> Scanning...</>
                : 'Scan & Save Notes'}
            </button>
          </div>
          {uploadLog.length > 0 && (
            <div style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.8 }}>
              {uploadLog.map((line, i) => (
                <div key={i} style={{ color: uploadStatus === 'error' && i === uploadLog.length - 1 ? 'var(--red)' : uploadStatus === 'done' && i === uploadLog.length - 1 ? 'var(--green)' : 'var(--text)' }}>
                  {i === uploadLog.length - 1 && uploadStatus === 'scanning' && <Loader size={11} className="spin" style={{ verticalAlign: 'middle', marginRight: 6 }} />}
                  {line}
                </div>
              ))}
            </div>
          )}
          {uploadStatus === 'done' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
              ✅ Notes saved! Select a course below to see them.
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Select a Course</h2>
          {selectedCode && (
            <button className="btn ghost" onClick={() => { setSelectedCode(''); setNotes([]); }}>
              <X size={13} /> Clear
            </button>
          )}
        </div>
        <select
          value={selectedCode}
          onChange={e => setSelectedCode(e.target.value)}
          style={{ width: '100%', fontSize: 14 }}
        >
          <option value="">-- Choose a course --</option>
          {termGroups.map(({ term, courses }) => (
            <optgroup key={term} label={term === 0 ? 'Program Reference' : `Term ${term}`}>
              {courses.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} -- {c.title}{c.cu > 0 ? ` (${c.type}, ${c.cu} CU)` : ''}{c.cert ? ` - ${c.cert}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {selectedCourse && (
        <div className="brief-item" style={{
          borderLeft: '4px solid var(--purple)',
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 12
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedCourse.code} -- {selectedCourse.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Term {selectedCourse.term} | {selectedCourse.type} | {selectedCourse.cu} CUs
              {selectedCourse.cert && ` | ${selectedCourse.cert}`}
            </div>
          </div>
        </div>
      )}

      {selectedCode && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <input
              placeholder="Search notes..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: '1 1 200px' }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value as NoteType | 'all')} style={{ flex: '0 0 auto' }}>
              <option value="all">All categories</option>
              {(Object.entries(NOTE_TYPE_LABELS) as [NoteType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <button className="btn primary" onClick={() => setShowAdd(v => !v)}>
              <Plus size={14} /> Add note
            </button>
          </div>

          {showAdd && (
            <section className="panel" style={{ borderLeft: '4px solid var(--purple)' }}>
              <div className="panel-head">
                <h2>Add a note for {selectedCode}</h2>
                <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Category</label>
              <select value={newType} onChange={e => setNewType(e.target.value as NoteType)} style={{ width: '100%', marginBottom: 10 }}>
                {(Object.entries(NOTE_TYPE_LABELS) as [NoteType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Content -- use dashes for bullets (- item)
              </label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="- Key info here&#10;- Another point&#10;- Student tip or resource"
                style={{ minHeight: 120, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn primary" onClick={handleAdd} disabled={saving || !newContent.trim()}>
                  {saving ? 'Saving...' : 'Save note'}
                </button>
              </div>
            </section>
          )}

          {loading ? (
            <div className="brief-item" style={{ color: 'var(--muted)' }}>Loading notes...</div>
          ) : filtered.length === 0 ? (
            <div className="brief-item" style={{ color: 'var(--muted)' }}>
              No notes found. Click "Add note" to start building your reference, or use "Scan Document" to upload study materials.
            </div>
          ) : (
            (Object.entries(NOTE_TYPE_LABELS) as [NoteType, string][])
              .filter(([type]) => grouped[type as NoteType]?.length > 0)
              .map(([type, label]) => (
                <section key={type} className="panel" style={{ borderLeft: `4px solid ${NOTE_TYPE_COLORS[type as NoteType]}` }}>
                  <div className="panel-head">
                    <h2 style={{ color: NOTE_TYPE_COLORS[type as NoteType] }}>{label}</h2>
                  </div>
                  {grouped[type as NoteType].map(note => (
                    <div key={note.id} style={{ marginBottom: 12 }}>
                      {editingId === note.id ? (
                        <div>
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            style={{ width: '100%', minHeight: 100, fontFamily: 'inherit', marginBottom: 8 }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn primary tiny" onClick={() => handleEdit(note)}>Save</button>
                            <button className="btn ghost tiny" onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{
                            fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                            background: 'var(--surface-1)', borderRadius: 8, padding: '8px 10px',
                          }}>
                            {note.content}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
                            <button className="btn ghost tiny" onClick={() => { setEditingId(note.id); setEditContent(note.content); }}>Edit</button>
                            <button className="btn ghost tiny" onClick={() => handleDelete(note.id)} style={{ color: 'var(--red)' }}>Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              ))
          )}
        </>
      )}

      {!selectedCode && (
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <FileText size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Select a course from the dropdown above to see your notes and tips for it.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
            All 38 BSCSIA 202509 courses are pre-loaded with notes from your course notes document.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
            Use <strong>Scan Document</strong> at the top to upload study materials and let AI sort them into the right courses automatically.
          </p>
        </section>
      )}
    </>
  );
}
