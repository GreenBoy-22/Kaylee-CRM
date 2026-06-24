// src/CourseNotes.tsx
//
// Work tab: BSCSIA Course Notes reference tool.
// - Dropdown to select a course
// - Pre-loaded structured notes from Kaylee's course notes + degree plan
// - Add-a-note section that auto-organizes into bullet categories
// - All notes stored in Supabase course_notes table

import { useCallback, useEffect, useState } from 'react';
import { Plus, Save, ChevronDown, BookOpen, X, RefreshCw, FileText } from 'lucide-react';
import { supabase } from './lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type NoteType = 'general' | 'pacing' | 'structure' | 'cert' | 'student_tips' | 'resources' | 'prereqs' | 'competencies';

interface CourseNote {
  id: string;
  course_code: string;
  note_type: NoteType;
  content: string;
  created_at: string;
  updated_at: string;
}

// ── Course catalog from BSCSIA 202509 degree plan ──────────────────────────

const COURSES: { code: string; title: string; term: number; cert?: string; type: string; cu: number }[] = [
  { code: 'PROGRAM', title: 'Program Overview — All Certs & Stackables', term: 0, type: 'Reference', cu: 0 },
  { code: 'C458',  title: 'Health, Fitness, and Wellness',             term: 1, type: 'OA', cu: 4 },
  { code: 'D322',  title: 'Introduction to IT',                        term: 1, type: 'OA', cu: 4 },
  { code: 'C683',  title: 'Natural Science Lab',                       term: 1, type: 'PA', cu: 2 },
  { code: 'D685',  title: 'Practical Applications of Prompt',          term: 1, type: 'OA', cu: 2 },
  { code: 'D333',  title: 'Ethics in Technology',                      term: 2, type: 'PA', cu: 3 },
  { code: 'D316',  title: 'IT Foundations',                            term: 2, type: 'Cert', cu: 4, cert: 'CompTIA A+ Core 1' },
  { code: 'C955',  title: 'Applied Probability and Statistics',        term: 2, type: 'OA', cu: 3 },
  { code: 'D270',  title: 'Composition – Successful Self-Expression',  term: 2, type: 'PA', cu: 3 },
  { code: 'C957',  title: 'Applied Algebra',                           term: 3, type: 'OA', cu: 3 },
  { code: 'D317',  title: 'IT Applications',                           term: 3, type: 'Cert', cu: 4, cert: 'CompTIA A+ Core 2' },
  { code: 'D827',  title: 'Fundamentals of Information Security',      term: 3, type: 'OA', cu: 3 },
  { code: 'D315',  title: 'Network and Security – Foundations',        term: 3, type: 'OA', cu: 3 },
  { code: 'D265',  title: 'Critical Thinking: Reason and Evidence',   term: 4, type: 'PA', cu: 3 },
  { code: 'D325',  title: 'Networks',                                  term: 4, type: 'Cert', cu: 4, cert: 'CompTIA Network+' },
  { code: 'D268',  title: 'Intro to Communication: Connecting with Others', term: 4, type: 'PA', cu: 3 },
  { code: 'D336',  title: 'Business of IT – Applications',            term: 4, type: 'Cert', cu: 4, cert: 'Axelos ITIL' },
  { code: 'C963',  title: 'American Politics and the US Constitution', term: 5, type: 'PA', cu: 3 },
  { code: 'D420',  title: 'Discrete Math: Logic',                     term: 5, type: 'OA', cu: 1 },
  { code: 'D329',  title: 'Network and Security – Applications',      term: 5, type: 'Cert', cu: 4, cert: 'CompTIA Security+' },
  { code: 'D828',  title: 'Legal Issues in Information Security',     term: 5, type: 'PA', cu: 4 },
  { code: 'D829',  title: 'Digital Forensics in Cybersecurity',       term: 6, type: 'PA', cu: 4 },
  { code: 'C845',  title: 'Information Systems Security',             term: 6, type: 'PA', cu: 4, cert: 'SSCP (optional voucher)' },
  { code: 'D324',  title: 'Business of IT – Project Management',     term: 6, type: 'Cert', cu: 4, cert: 'CompTIA Project+' },
  { code: 'D421',  title: 'Discrete Math: Functions and Relations',   term: 7, type: 'OA', cu: 1 },
  { code: 'D422',  title: 'Discrete Math: Algorithms and Cryptography', term: 7, type: 'OA', cu: 1 },
  { code: 'D830',  title: 'Introduction to Cryptography',             term: 7, type: 'OA+PA', cu: 4 },
  { code: 'D832',  title: 'Managing Information Security',            term: 7, type: 'PA', cu: 3 },
  { code: 'D278',  title: 'Scripting and Programming – Foundations', term: 7, type: 'OA', cu: 3 },
  { code: 'D281',  title: 'Linux Foundations',                        term: 8, type: 'Cert', cu: 3, cert: 'LPI Linux Essentials' },
  { code: 'D426',  title: 'Data Management – Foundations',            term: 8, type: 'OA', cu: 3 },
  { code: 'D522',  title: 'Python for IT Automation',                 term: 8, type: 'OA', cu: 3 },
  { code: 'D492',  title: 'Data Analytics – Applications',            term: 8, type: 'Cert', cu: 4, cert: 'CompTIA Data+' },
  { code: 'D385',  title: 'Software Security and Testing',            term: 9, type: 'PA', cu: 3 },
  { code: 'D831',  title: 'Introduction to AI and Security',          term: 9, type: 'OA', cu: 2 },
  { code: 'D340',  title: 'Cyber Defense and Countermeasures',        term: 9, type: 'Cert', cu: 4, cert: 'CompTIA CySA+' },
  { code: 'D320',  title: 'Managing Cloud Security',                  term: 9, type: 'OA', cu: 4, cert: 'CCSP (optional voucher)' },
  { code: 'D332',  title: 'Penetration Testing and Vulnerability Analysis', term: 10, type: 'Cert', cu: 4, cert: 'CompTIA PenTest+' },
  { code: 'D833',  title: 'Cybersecurity and Information Assurance Capstone', term: 10, type: 'PA', cu: 4 },
];

// ── Pre-loaded notes from Kaylee's course notes document ──────────────────

const PRELOADED_NOTES: Record<string, { type: NoteType; content: string }[]> = {
  'PROGRAM': [
    { type: 'general', content: '• 122 total CUs across 38 courses\n• 10 terms of 6 months each\n• Minimum 12 CUs per term required\n• Competency-based: degree earned by demonstrating skills, not seat time\n• Must complete 66.67% of attempted units to maintain SAP\n• First term: must pass at least 3 CUs to maintain financial aid eligibility' },
    { type: 'cert', content: '🏆 CERTS INCLUDED IN BSCSIA 202509:\n• CompTIA A+ Core 1 (D316) — Webcam/PearsonVUE\n• CompTIA A+ Core 2 (D317) — Webcam/PearsonVUE\n• CompTIA Network+ (D325) — Webcam/PearsonVUE\n• CompTIA Security+ (D329) — TEST CENTER ONLY\n• Axelos ITIL Foundation (D336) — PeopleSoft\n• CompTIA Project+ (D324) — Webcam/PearsonVUE\n• LPI Linux Essentials (D281) — Webcam/PearsonVUE\n• ISC2 SSCP (C845) — optional voucher, PearsonVUE\n• CompTIA Data+ (D492) — Webcam/PearsonVUE\n• CompTIA CySA+ (D340) — Webcam/PearsonVUE\n• ISC2 CCSP (D320) — optional voucher, PearsonVUE\n• CompTIA PenTest+ (D332) — Webcam/PearsonVUE' },
    { type: 'cert', content: '🎯 STACKABLE CERTS (earned automatically by CompTIA):\n• CompTIA IT Operations Specialist = A+ Core 1 + A+ Core 2\n• CompTIA Secure Infrastructure Specialist = A+ Core 1 + A+ Core 2 + Network+\n• CompTIA Network Vulnerability Assessment Professional = Network+ + Security+ + PenTest+\n• CompTIA Network Security Professional = Network+ + Security+ + PenTest+ + CySA+\n• CompTIA Security Analytics Professional = Security+ + CySA+' },
  ],

  'C458': [
    { type: 'competencies', content: '• Identifies factors that influence mental, emotional, and social wellness
• Identifies the application of core competencies of social and emotional learning
• Identifies the influence of disease, fitness, and lifestyle on the body
• Identifies the principles of nutrition and components of a healthy diet' },
    { type: 'pacing', content: '• Speedy: 1 week\n• Steady: 2 weeks\n• Deliberate: 4 weeks' },
    { type: 'structure', content: '• 4 sections each followed by a section test\n• Section 1: Physical Health (11 lessons)\n• Section 2: Nutrition (10 lessons)\n• Section 3: Emotional Health (10 lessons)\n• Section 4: SEL (17 lessons)' },
    { type: 'student_tips', content: '• Email questions to health@wgu.edu — team-taught, no individual instructor\n• Start by watching the welcome video\n• Access videos and podcasts to reinforce learning' },
  ],
  'C683': [
    { type: 'competencies', content: '• Accurately executes the process of scientific inquiry through experimentation in the natural world
• Draws conclusions based on academic research and scientific inquiry
• Evaluates academic sources for their credibility and relevance to a chosen research topic on a natural world phenomenon' },
    { type: 'structure', content: '• 10 lessons to prepare for PA\n• PA: Students conduct a science experiment — research, design, perform, write a report\n• V4 launched 5/11/26: Enhanced learning resources, improved instructional clarity, updated videos' },
  ],
  'D322': [
    { type: 'competencies', content: '• Describes fundamental data management functions in databases
• Describes basics of programming languages in software development
• Describes the role of the IT department in IT infrastructure management, disaster recovery, and business continuity
• Describes structure, function, and security associated with networks
• Evaluates ethical concerns in information technology
• Explains different computer hardware and networking technologies
• Identifies components of software and its relation to operating systems
• Identifies computer hardware components' },
    { type: 'pacing', content: '• Speedy: 2-3 weeks\n• Steady: 3-4 weeks\n• Deliberate: 4-5 weeks' },
    { type: 'structure', content: '• 8 sections\n• Has a "21 Challenge Plan" to complete the course\n• Questions on comprehensive reviews and readiness quizzes are same as pre-assessment\n• Aim for 85% min score on practice test' },
    { type: 'resources', content: '• Watch "Why/Why not?" video for test-taking strategy\n• Sharepoint site: Great resources — link in notes\n• Udemy: CompTIA IT Fundamentals ITF+ practice tests' },
  ],
  'D685': [
    { type: 'competencies', content: '• Creates effective prompts with consideration of scope, specificity, and context to elicit targeted information
• Evaluates the efficacy of writing different prompts on research outcomes and improves depth and quality of analytical investigations
• Evaluates the images, texts, and sound of the prompt and adjusts prompts to output relevant results
• Explains why prompt engineering is necessary' },
    { type: 'pacing', content: '• Speedy: 2 weeks or less (10-Day Challenge Plan)\n• Steady: 3 weeks\n• Deliberate: 4 weeks\n• Can complete in 7 days and pass OA on 1st attempt' },
    { type: 'structure', content: '• 4 sections: Generative AI & Prompt Engineering, Crafting Effective Prompts, Prompt Methods & Evaluation, Prompt Engineering Optimization\n• Videos via Pluralsight\n• 2 practice tests at end — do both and pre-assessment before OA\n• Replaces C844 Emerging Technologies' },
    { type: 'student_tips', content: '• Practice ChatGPT or Gemini with varying levels of detail and observe output differences\n• Use prompt frameworks: Persona/Instruction/Output format for different tasks' },
  ],
  'D316': [
    { type: 'competencies', content: '• Configures common hardware and software components of mobile devices
• Configures common hardware in computer systems
• Configures wired and wireless networks
• Creates client-side virtualization with cloud computing components
• Troubleshoots hardware, software, and network issues with best practice methodologies' },
    { type: 'pacing', content: '• Accel: 2 weeks\n• Speedy: 3-4 weeks\n• Steady: 4-6 weeks\n• Deliberate: 8 weeks\n• Average time: 8 weeks' },
    { type: 'cert', content: '• Cert: CompTIA A+ Core 1\n• Voucher covers BOTH D316 and D317 (shared voucher)\n• Request approval under Assessments — voucher arrives within 48 hours\n• Use WGU email address for test registration' },
    { type: 'structure', content: '• 6 sections: Welcome, Support, Hardware, Networks, Mobile Devices, Printers\n• Some sections include interactive labs\n• No lab orientation in this course — orientation is in D317' },
    { type: 'student_tips', content: '• Skip PBQs if needed, come back later\n• Test strategy: 1st pass = easy MC, 2nd pass = medium difficulty, Final = PBQs and flagged\n• Never leave a question blank\n• Helpful instructors: Lori Davis, Arthur Moore\n• Check Course Playbook FAQ for "Student Tips"' },
    { type: 'cert', content: '• Exam: CompTIA A+ Core 1 (220-1101)\n• 90 questions max, 90 minutes\n• Passing score: 675/900\n• Question types: Multiple choice, drag-and-drop, performance-based\n• Renewal: Every 3 years via CE or retake\n• Voucher shared with D317 — one voucher covers BOTH exams\n• Exam location: Webcam or PearsonVUE test center\n• Waiting period between attempts: 0, 14, 14 days' },
  ],
  'D317': [
    { type: 'competencies', content: '• Identifies operating systems and their configurations
• Identifies remote access technology solutions
• Identifies scripting basics
• Implements basic disaster recovery and business continuity procedures
• Implements basic operational procedures (documentation, change mgmt, compliance, communication)
• Implements security principles across devices and networks
• Troubleshoots software, security, and malware issues' },
    { type: 'pacing', content: '• Accel: 2 weeks\n• Speedy: 3-4 weeks\n• Steady: 4-6 weeks\n• Deliberate: 8 weeks\n• Average time: 6 weeks' },
    { type: 'cert', content: '• Cert: CompTIA A+ Core 2\n• Voucher covers BOTH D316 and D317\n• Request approval under Assessments — voucher arrives within 48 hours\n• Test uses drag-and-drop, matching, and answer resequencing' },
    { type: 'structure', content: '• 6 sections, 13 lessons\n• Sections: Welcome, Support, Operating Systems, Security, Mobile, Using Data Security\n• 6 practice exams + CertMaster Practice exam — goal: 85% score' },
    { type: 'student_tips', content: '• Reading-based learners: CompTIA ebook + CertMaster Perform\n• Video-based learners: Udemy + Percipio\n• Linux cheat sheet resource available (one pager)\n• Helpful instructors: Lori Davis, Arthur Moore' },
    { type: 'cert', content: '• Exam: CompTIA A+ Core 2 (220-1102)\n• 90 questions max, 90 minutes\n• Passing score: 700/900\n• Question types: Multiple choice, drag-and-drop, performance-based\n• Renewal: Every 3 years via CE or retake\n• Voucher shared with D316 — one voucher covers BOTH exams\n• Exam location: Webcam or PearsonVUE test center\n• Waiting period between attempts: 0, 14, 14 days\n• Stackable certs earned with A+: CompTIA IT Operations Specialist, CompTIA Secure Infrastructure Specialist' },
  ],
  'C955': [
    { type: 'competencies', content: '• Applies principles and methods of probability-based mathematics to explain and solve problems
• Applies operations/processes of basic algebra to evaluate quantitative expressions, solve equations/inequalities
• Applies operations/processes of fractions, decimals, and percentages to evaluate quantitative expressions
• Evaluates categorical and quantitative data for a single variable using appropriate graphical displays and numerical measures
• Evaluates the relationship between two quantitative variables through correlation and regression
• Evaluates the relationship between two variables through interpretation of visual displays and numerical measures' },
    { type: 'pacing', content: '• Speedy: 2 weeks or less\n• Steady: 4-6 weeks\n• Deliberate: 6-10 weeks' },
    { type: 'structure', content: '• 7 modules via MindEdge\n• Module 1: Basic Numeracy (25 tasks) through Module 7: Probability (16 tasks)\n• Includes pre-quiz, readings, examples, key terms, games, flashcards, tests' },
    { type: 'student_tips', content: '• Recommended calculator: TI-30XS Multiview\n• Watch cohort videos first, then read text, do every practice set\n• Access the recorded cohort videos\n• Per Zach Vega: Have the recommended calculator — reduces fractions out of the hundreds' },
  ],
  'D270': [
    { type: 'competencies', content: '• Composes a written message with language appropriate for cross-cultural communication
• Incorporates research to support a position or idea
• Incorporates self-expression in written communication
• Researches valid and reliable sources
• Writes a message using an effective communication approach for a given situation
• Writes a reference list
• Writes in a professional manner for a given scenario' },
    { type: 'pacing', content: '• Speedy: 1-2 weeks (submit task every 2-3 days)\n• Steady: 3-4 weeks (submit task every 7 days or less)\n• Deliberate: 5-6 weeks (submit task every 10-14 days or less)' },
    { type: 'structure', content: '• 4 sections: Writing an Appropriate Message, Support with Resources, Support with Sources, Support with Sources (References)\n• Each section ends with a test\n• About 48 hours to receive evaluator feedback' },
    { type: 'student_tips', content: '• Meet with an instructor at the beginning of the course\n• View sample tasks to understand structure\n• Email work to selfexpression@wgu.edu for feedback\n• Use WGU Library resources' },
  ],
  'C957': [
    { type: 'competencies', content: '• Analyzes graphical depictions of real-world situations using functional properties
• Applies exponential functions and their properties to real-world problems
• Applies linear functions and their properties to real-world problems
• Applies logistic functions and their properties to real-world problems
• Applies polynomial functions and their properties to real-world problems
• Interprets the real-world meaning of various functions based on notation, graphical representations, and data representations
• Verifies the validity of a given model' },
    { type: 'pacing', content: '• Speedy: 2 weeks or less\n• Steady: 4-6 weeks\n• Deliberate: 6-8 weeks' },
    { type: 'structure', content: '• 8 sections covering Function Interpretation through Validity of Models\n• 3 paths: Linear (start to finish), Topical (theme approach), Targeted (quiz first, focus on weak areas)\n• Math taught through real-world applications' },
    { type: 'student_tips', content: '• Whiteboard recommended for practice and the OA\n• Instructors available 7 days/week without appointment at Live Instructor Support\n• Read "How to Succeed in Applied Algebra" in COS\n• Peer tutoring available under "Course Tips"' },
  ],
  'D315': [
    { type: 'competencies', content: '• Applies network security concepts for business continuity, data access, and confidentiality
• Identifies basic network systems and concepts related to networking technologies
• Identifies solutions for compliance with security guidance' },
    { type: 'structure', content: '• 3 sections: Intro to Networking Concepts, Intro to Network Security, Network Security Options\n• Flow: Read, watch, some knowledge checks and activities\n• Has pre-assessment and WGU OA' },
    { type: 'resources', content: '• OSI Layers Quiz — ExamCompass\n• Wireless Networking Quiz — ExamCompass\n• Network Devices Quiz — ExamCompass\n• Quizlet study sets available\n• C172 Cohort recordings (Webex links)' },
  ],
  'D827': [
    { type: 'competencies', content: '• Explains how human, organizational, and societal factors impact cybersecurity
• Identifies the threats, principles, standards, and industry best practices related to connection and system security
• Identifies the threats, principles, standards, and industry best practices related to data security
• Identifies the threats, principles, standards, and industry best practices related to software and component security' },
    { type: 'structure', content: '• 12 sections via Zybooks\n• Content starts at section 3 — section 2 is career exploration\n• Labs in sections 5, 7, 9 — info will reappear on OA\n• Green labs are required; optional labs are in a different platform\n• More interactive than old course (labs, animations, optional items)' },
    { type: 'student_tips', content: '• Pre-assessment is NOT reflective of OA — pre is definition-driven; OA is scenario-based\n• Read the electronic textbook\n• Pay special attention to the CIA triad\n• Complete optional items — helps with future coursework\n• Salesforce limits students to signing up for only 1 cohort at a time' },
    { type: 'resources', content: '• Quizlet: D827 Pre Exam flash cards\n• Quizlet: D827 Practice Exam 1 and 2\n• Quizlet: D827 Acronyms complete list\n• cyberseek.org — good for exploring cyber careers' },
  ],
  'D265': [
    { type: 'competencies', content: '• Evaluates bias and its impact
• Evaluates evidence based on source credibility
• Evaluates the quality of an argument
• Makes claims based on evidence' },
    { type: 'pacing', content: '• 1-2 weeks if highly motivated\n• New PAMS version 3/COS version 2 has a PA (older version has OA)' },
    { type: 'structure', content: '• 5 sections: Evaluating Arguments, Source Credibility, Identifying Bias, Making a Claim, Review with Feedback Practice PA\n• Each section ends with application/test' },
    { type: 'student_tips', content: '• Do not try to overcomplicate the PA tasks\n• SWAY walkthrough available including 10-min video sample (accessible on cell phone)\n• PA task can take 30 minutes once student understands content\n• Returned PAs come with video feedback from instructor\n• Template available for the PA' },
  ],
  'D325': [
    { type: 'competencies', content: '• Configures a network infrastructure
• Configures networking components
• Implements network security techniques
• Optimizes network operations for availability, performance, and security
• Troubleshoots network issues' },
    { type: 'pacing', content: '• Speedy: 4 weeks or less\n• Steady: 6-8 weeks\n• Deliberate: 8-12 weeks\n• Average time: 9 weeks' },
    { type: 'cert', content: '• Cert: CompTIA Network+\n• Voucher requirements (request): 80%+ on CertMaster Perform/Practice Assessment OR 85%+ on Jason Dion Practice Quizzes 1 or 2 OR Mike Myers Practice Quizzes (screenshot required)\n• Uses Network Sandbox lab and CertMaster curriculum' },
    { type: 'structure', content: '• 5 sections, 14 modules\n• Section 1: Hardware and Topologies (Modules 1-3)\n• Section 2: Network Services & Configuration (Modules 4-6)\n• Section 3: Managing Networks (Modules 7-9)\n• Section 4: Secure Networks (Modules 10-12)\n• Section 5: Remote Access & Cloud Technologies (Modules 13-14)' },
    { type: 'student_tips', content: '• 6-week pacing guide in WGU Connect\n• Use Jason Dion practice tests IN ADDITION to CompTIA practice tests\n• Jason Dion on Udemy: "CompTIA Network+ (N10-009) 6 Practice Exams Set 1"\n• Great instructors: Ken Aitken, Lori Davis, Josh Dunn (sends weekly test question texts)' },
    { type: 'cert', content: '• Exam: CompTIA Network+ (N10-009)\n• 90 questions max, 90 minutes\n• Passing score: 720/900\n• Renewal: Every 3 years via CE or retake\n• Exam location: Webcam or PearsonVUE\n• Waiting period: 0, 14, 14 days\n• Stackable certs: CompTIA IT Operations Specialist, CompTIA Secure Infrastructure Specialist (with A+)' },
  ],
  'D268': [
    { type: 'competencies', content: '• Implements appropriate communication styles based on audience and setting
• Uses communication strategies for managing conflict
• Uses communication strategies to influence others' },
    { type: 'pacing', content: '• Speedy: 3 weeks or less\n• Steady: 4-6 weeks\n• Deliberate: 6-10 weeks' },
    { type: 'structure', content: '• 3 sections: Communicating in Diverse Groups, Art of Conflict Management & Professional Conversations, Influencing Others\n• Each section ends with Application & Test\n• If student answers "yes" to "Prepare for Assessment" — can start section with section test' },
    { type: 'student_tips', content: '• Complete the PA after each section\n• Complete the CPT for this course\n• Instructors recommend Panopto Capture for Tasks 1 and 3\n• Task 3 requires multimedia presentation with video — students can use voiceover instead of being on camera\n• Connect with Assessment Services if needing help' },
  ],
  'D336': [
    { type: 'competencies', content: '• Applies ITIL concepts, core components, principles, and models of service management
• Applies the ITIL six activities of the service value chain' },
    { type: 'pacing', content: '• Average time: 6 weeks' },
    { type: 'cert', content: '• Cert: Axelos ITIL (taken through PeopleSoft)\n• Course links in last section (Exam Readiness): 6 full-length practice tests, CyberVista practice exam' },
    { type: 'structure', content: '• 6 sections: Course Overview, Key Concepts of Service Management, Four Dimensions, Guiding Principles & Practices, Key ITIL Practices, Exam Readiness\n• Flow: Read chapters, watch videos, knowledge check, section test, summary' },
    { type: 'cert', content: '• Exam: Axelos ITIL Foundation\n• Taken through PeopleSoft (not PearsonVUE)\n• 40 questions, 60 minutes\n• Passing score: 65% (26/40)\n• Closed book exam\n• Renewal: Not required — foundation cert is lifetime\n• No waiting period between attempts: 0, 5, 5 days' },
  ],
  'C963': [
    { type: 'competencies', content: '• Describes the influence of competing political ideologies on the development of the US government
• Examines the influence of political parties, citizens, and non-governmental organizations on elections and political processes
• Examines the influence of media, public opinion, and political discourse on American democracy
• Examines the struggle to balance individual liberty, public order, and state\'s rights
• Explains how the structure and powers of the US government interact to form public policy' },
    { type: 'pacing', content: '• Per R. Boyce: 3 weeks max; can be done in a weekend if students push themselves\n• Change from OA to PA effective 6/3/25 — 3 tasks' },
    { type: 'structure', content: '• 5 sections: Constitutional Democracy, Structure of US Government, Political Participation, Civil Liberties & Rights, Public Opinion and Media\n• Each lesson: smaller parts (videos, readings, knowledge checks, summary, quiz)' },
    { type: 'resources', content: '• WGU Connect: recorded videos and audio podcasts\n• Cohorts: 3 Tasks in 30 minutes, individual ones for each task, task-writing success strategies' },
  ],
  'D420': [
    { type: 'competencies', content: '• Evaluates the truth of statements using proofs and the principles of deductive logic
• Minimizes circuits using Boolean algebra and Boolean functions' },
    { type: 'pacing', content: '• Speedy: 10 days or less\n• Steady: 2-3 weeks\n• Deliberate: 3-5 weeks\n• Goal: 3 weeks or less\n• Updated versions rolled 2/17/26: updated OA, Pre-assessment, improved instructional flow' },
    { type: 'structure', content: '• 10 modules via Zybooks\n• Modules 1-6: Propositions through Competency 1 Review\n• Modules 7-10: Boolean Algebra through Competency 2 Review\n• Formula sheet IS provided on OA\n• Instructors do live events through the week — no appointment necessary' },
    { type: 'student_tips', content: '• Do NOT approach as a math course — it is symbol recognition and patterns\n• Take pre-assessment right away — formula sheet and general rules help identify what to memorize\n• YouTube videos helpful: Kimberly Brehm (#1-21)\n• Work on course a little every day\n• Most students who pass pre-assessment on 1st attempt also pass OA on 1st attempt\n• Most students need 2 attempts on OA' },
  ],
  'D329': [
    { type: 'competencies', content: '• Analyzes information security controls, governance, risk, and compliance
• Designs security solutions for enterprise infrastructures and architectures
• Executes operations and incident response with tools, policies, forensics, and mitigation techniques
• Identifies threats, attacks, and vulnerabilities to organizational security
• Implements security solutions across hardware, applications, and network services' },
    { type: 'pacing', content: '• Speedy: 3 weeks or less\n• Steady: 4-8 weeks\n• Deliberate: 9-12 weeks\n• Average time: 9 weeks' },
    { type: 'cert', content: '• Cert: CompTIA Security+\n• Must take at a test center (whiteboard and markers provided)\n• Linked to CertMaster curriculum\n• 8-week pacing guide in instructor welcome email' },
    { type: 'structure', content: '• 8 sections, 16 lessons\n• Covers: Network Security, Securing Information, Vulnerabilities, Capabilities, Security Incidents, Security Management & Policy\n• Course rhythm: bounce between WGU materials (videos, labs) and CompTIA (review activities, PBQs, practice questions)\n• Aim for 90% on all labs, quizzes, practice tests' },
    { type: 'student_tips', content: '• Test is difficult because of TIME limitation, not content\n• Skip simulations and do at end OR do them quickly\n• Read each question thoroughly to know exactly what is being asked\n• Confidence level ratings on each page before moving on' },
    { type: 'cert', content: '• Exam: CompTIA Security+ (SY0-701)\n• 90 questions max, 90 minutes\n• Passing score: 750/900\n• Renewal: Every 3 years via CE or retake\n• Must take at a test center — whiteboard and markers provided\n• Waiting period: 0, 14, 14 days\n• Stackable certs earned: CompTIA Secure Infrastructure Specialist, CompTIA Security Analytics Professional, CompTIA Network Vulnerability Assessment Professional, CompTIA Network Security Professional' },
  ],
  'D828': [
    { type: 'competencies', content: '• Analyzes applicable regional, national, international, and industry legal requirements and system security best practices
• Discusses the implications of ethical issues for specific cybersecurity actions within an organization
• Explains the fundamental standards, frameworks, and practices of data privacy and data privacy protection
• Outlines a security awareness training and education (SATE) program to raise employee awareness' },
    { type: 'pacing', content: '• Speedy: 3 weeks or less\n• Steady: 4-5 weeks\n• Deliberate: 6-7 weeks\n• 25 days to complete — moved to term 7 — not recommended to pull into terms 1 or 2' },
    { type: 'structure', content: '• 22 sections via Zybooks\n• Covers: Governance/Risk/Compliance, Cybersecurity Landscape, Cyber Leadership, NIST frameworks, US & International regulations, Privacy laws, Auditing, AI in Cyber\n• Has 1 lab and 4 case studies\n• Video from section 21.2 is crucial to watch BEFORE completing Task 2 (tracked via LinkedIn Learning)\n• Task 1: Framework is not specifically identified — student must infer what is there' },
    { type: 'student_tips', content: '• Bottom right corner of Zybooks: "Getting started" button — good for students to click\n• Bottom of subtopics: "Print lesson" button for those who prefer print format\n• Watch all videos (some are over an hour long)\n• Per Zach Vega: Join WGU Connect, read rubrics, use template' },
  ],
  'D829': [
    { type: 'competencies', content: '• Analyzes gathered evidence with forensic tools in alignment with investigation processes
• Collects forensic evidence from deleted files and artifacts
• Creates incident reports communicating the conclusions of a forensic investigation to organizational stakeholders
• Identifies laws, rules, standards, policies, and best practices related to digital forensics' },
    { type: 'pacing', content: '• Speedy: 3 weeks or less\n• Steady: 4-5 weeks\n• Deliberate: 5-6 weeks\n• Course playbook shows week-to-week breakdown by pace preference' },
    { type: 'prereqs', content: '• Complete AFTER: D316, D317, D315, D325, D329\n• Certs needed before: A+, Network+' },
    { type: 'structure', content: '• 21 sections via Zybooks + Autopsy\n• Has readings, videos, labs, 1 PA (requires screenshots uploaded in specific manner)\n• Dense reading — read out loud, hyper focus, or use free text/speech\n• PA: complete in tandem with lab open; use rubric to align with "competent" column' },
    { type: 'student_tips', content: '• Do not just describe what the tool shows — EXPLAIN WHY IT MATTERS\n• Focus on interpreting findings and connecting back to investigation scenario\n• Stick to pacing chart — rushing leads to missed screenshots or incomplete analysis\n• To meet student ID requirement: open NotePad with "My student number is [#]" in each screenshot\n• Read WGU Connect discussions and watch resources tab video BEFORE starting\n• Recorded cohort helps with writing the paper' },
  ],
  'C845': [
    { type: 'competencies', content: '• Defends the security of a network by maintaining the CIA of information transmitted over communication networks
• Evaluates cryptographic systems and operations to protect data security
• Evaluates security concerns with countermeasures to guard against malicious activity to end-point devices, virtualization, cloud, and large-scale distributed systems
• Evaluates security incident handling plans to protect and preserve organization assets and data
• Evaluates security operations concepts and policies to ensure CIA of information assets
• Manages control access to privileged, confidential, or proprietary resources
• Proposes security risk mitigation processes to identify, evaluate, prioritize, and prevent potential security threats' },
    { type: 'pacing', content: '• Speedy pace (med/high on CPT): 4 weeks or less\n• 3 PA tasks to pass course (~2-3 pages per PA)' },
    { type: 'cert', content: '• Optional SSCP cert voucher available after passing PAs — good for 1 year from issue date\n• Per Holly: Student who takes SSCP cert test BEFORE the course CAN submit passing score for course credit\n• After finishing course, students LOSE course material access but keep LinkedIn Learning and WGU Library access\n• Plan to take cert test within the SAME TERM (optional)\n• Certificate not given until graduation — students are SSCP Associates until then' },
    { type: 'structure', content: '• 7 domains: Security Concepts, Access Controls, Risk ID/Monitoring/Analysis, Incident Response/Recovery, Cryptography, Network/Communications Security, Systems/Application Security\n• Flow: Intro, Learning Objectives, Learning Activity, Knowledge Check, Summary → then SSCP Cert Prep section\n• Mike Chapple YouTube videos available' },
    { type: 'student_tips', content: '• Per Justin Moss: Overdo the risk definition on PAs — what evaluators look for may not match task requirements\n• Per Zach Vega: Use WGU Connect recorded cohorts — explains tasks and what evaluators want\n• Per Chad Kliewer (Instructor): Read domains 1-3 → write Task 1, read 4-5 → write Task 2, read 6-7 → write Task 3\n• Per Dillon Gonyea on SSCP exam: Hardest cert so far; some elements from Project+, Security+, Network+; no going back on test' },
    { type: 'cert', content: '• Exam: ISC2 SSCP (Systems Security Certified Practitioner)\n• 125 questions, 3 hours\n• Passing score: 700/1000\n• Computer adaptive testing (CAT format)\n• Voucher: optional, available after passing all PAs — good for 1 year\n• Exam location: PearsonVUE only\n• Renewal: Every 3 years — requires 60 CPE credits\n• Students identified as "SSCP Associate" until graduation/experience requirement met\n• 2 years of work experience required for full SSCP designation (waived 1 year with degree)\n• After finishing course: lose course access but keep LinkedIn Learning + WGU Library' },
  ],
  'D324': [
    { type: 'competencies', content: '• Applies communication methods and change control processes within a project
• Determines requirements of a project management plan
• Identifies project factors, constraints, and risk strategies' },
    { type: 'pacing', content: '• Speedy: 3 weeks or less\n• Steady: 6-8 weeks\n• Deliberate: 8-12 weeks\n• Average time: 8 weeks' },
    { type: 'cert', content: '• Cert: CompTIA Project+\n• Calculator provided on cert test; whiteboard/paper provided\n• Per Lauren C.: Project+ earned BEFORE Oct 1, 2025 = good for life; earned ON or AFTER = expires every 3 years' },
    { type: 'structure', content: '• 4 parts, 14 lessons linked to CertMaster\n• Parts: Project Mgmt Intro, Initiating and Planning (Lessons 3-9), Executing/Monitoring/Controlling (Lessons 10-13), Closing (Lesson 14)\n• Course rhythm: bounce between WGU materials and CompTIA (includes PBQs, practice questions)\n• 9 Performance-based Questions/tasks\n• Aim for 90%+ on quizzes, labs, practice tests' },
    { type: 'student_tips', content: '• Course is HEAVY on terminology — make flashcards or take notes\n• Per Justin Moss: CompTIA practice tests more helpful than Jason Dion (too wordy)\n• Per Zach Vega: Use CompTIA approach to answer — what CompTIA says is right vs. what YOU think is right\n• Set course end date in CompTIA materials to activate countdown\n• Flashcards and Game Center on left side' },
    { type: 'cert', content: '• Exam: CompTIA Project+ (PK0-005)\n• 95 questions max, 90 minutes\n• Passing score: 710/900\n• Calculator and whiteboard/paper provided during exam\n• Renewal: Certs earned BEFORE Oct 1, 2025 = good for life; ON or AFTER Oct 1, 2025 = expires every 3 years\n• Exam location: Webcam or PearsonVUE\n• Waiting period: 0, 14, 14 days' },
  ],
  'D421': [
    { type: 'competencies', content: '• Analyzes mathematical problems using relations and directed graphs
• Analyzes relationships between sets and functions' },
    { type: 'pacing', content: '• Speedy: 10 days or less\n• Steady: 2-3 weeks\n• Deliberate: 3-5 weeks\n• Goal: 3 weeks or less\n• Updated 2/17/26: updated OA, Pre-assessment, improved instructional flow' },
    { type: 'structure', content: '• 9 modules: Working with Sets, Higher Set Operations, Overview of Functions, Comp & Apps, Competency 1 Review, Binary Relations, Order Relations, N-ary Relations, Competency 2 Review\n• NO formula sheets allowed — must memorize' },
  ],
  'D422': [
    { type: 'competencies', content: '• Analyzes linear algorithms and associated big-O estimates
• Analyzes the use of number theory in cryptography' },
    { type: 'pacing', content: '• Speedy: 10 days or less\n• Steady: 2-3 weeks\n• Deliberate: 3-5 weeks\n• Goal: 3 weeks or less\n• Updated 2/17/26: updated OA, Pre-assessment, improved instructional flow' },
    { type: 'structure', content: '• 10 modules: Algorithm Structures through Math Foundations of Encryption\n• NO formula sheets allowed — must memorize\n• This course prepares for D830 Intro to Cryptography' },
  ],
  'D830': [
    { type: 'competencies', content: '• Analyzes principles and operations of cryptographic algorithms and protocols to enhance an organization\'s ability to design and evaluate secure systems
• Explains foundational cryptography concepts and the elements of a cryptographic system
• Explains how cryptography frameworks inform alignment of organizational and information security guidelines
• Implements encryption methods with symmetric and asymmetric algorithms' },
    { type: 'pacing', content: '• 4-6 weeks to complete\n• 30-day pacing guide in WGU Connect Resources' },
    { type: 'prereqs', content: '• Complete AFTER: D316, D317, D315, D325, D329' },
    { type: 'structure', content: '• 12 sections via Zybooks (more interactive: videos, labs, knowledge checks)\n• Topics: in-depth security protocols, email security, cryptography frameworks, security guidelines, heavy math\n• Has pre-assessment (must complete to unlock OA), OA with 30 questions, AND 2 PAs (lab + written task)\n• PA scenario assigned based on student\'s last name' },
  ],
  'D832': [
    { type: 'competencies', content: '• Develops security incident response plans that align to an organization\'s security goals and objectives and maintain business continuity
• Recommends changes to established security management programs in response to a cyber-related incident
• Recommends modifications to established information security governance to increase information assurance levels
• Recommends risk mitigation strategies relevant to an organization\'s information security program
• Recommends strategies for meeting regulatory compliance within an organization' },
    { type: 'pacing', content: '• Course can be completed in a week\n• Speedy: 2 weeks or less\n• Steady: 4 weeks\n• Deliberate: 6 weeks\n• Course playbook shows week-to-week breakdown by pace' },
    { type: 'structure', content: '• 28 parts via Zybooks\n• Readings and course material may NOT be required — goal is to pass the PA\n• Configurable: students can rearrange lesson order or omit lessons ("Configure Zybook" button)\n• PA: 5 case studies, 4 tasks (equal to 2 typical WGU PA tasks), focused on incident response\n• Running case study throughout course prepares for PA' },
    { type: 'student_tips', content: '• Forage website: Sign in with WGU email, complete tasks, download certificate from "Achievements" and upload to WGU course\n• WGU Connect "All in One Guide" — very helpful\n• Some videos marked "optional" — still worth watching' },
  ],
  'D278': [
    { type: 'competencies', content: '• Explains the logic and outcome of simple algorithms
• Identifies scripts for computer program requirements
• Uses fundamental programming elements as part of common computer programming tasks' },
    { type: 'pacing', content: '• Per Doug: typical pacing is 4 weeks' },
    { type: 'structure', content: '• 11 sections via Zybooks\n• Sections 1-4: Intro, Variables, Branches, Loops\n• Sections 5-11: Arrays, Functions, Algorithms, Design Process, Software Topics, Troubleshooting, Debugging\n• Includes labs throughout' },
  ],
  'D281': [
    { type: 'competencies', content: '• Develops resources for data access and security
• Identifies the fundamentals of open-source software' },
    { type: 'pacing', content: '• Speedy: 4 weeks or less\n• Steady: 5 weeks\n• Deliberate: 6 weeks\n• Average time: 6 weeks' },
    { type: 'cert', content: '• Cert: Linux Professional Institute (LPI) Linux Essentials' },
    { type: 'structure', content: '• 3 sections: Welcome, Linux Essentials (8 lessons — Lessons 2 and 8 are LONG), Labs with virtual machine\n• Critical areas: Topics 2 (long), 3, and 5\n• Lesson flow: chapter reading, videos, knowledge checks' },
    { type: 'cert', content: '• Exam: LPI Linux Essentials (010-160)\n• 40 questions, 60 minutes\n• Passing score: 500/800\n• Exam location: Webcam or PearsonVUE\n• Renewal: Not required — lifetime certification\n• Waiting period: 7, 30, 30 days' },
  ],
  'D426': [
    { type: 'competencies', content: '• Defines primary and foreign keys in data normalization
• Determines how to run queries for creation and manipulation of data in relational databases
• Explains attributes of databases, database tables, and structured and associated query language (SQL) commands' },
    { type: 'pacing', content: '• Speedy: 4 weeks or less\n• Steady: 5-6 weeks\n• Deliberate: 7-8 weeks' },
    { type: 'structure', content: '• 5 sections via Zybooks: Intro to Databases, Database Management (10 lessons, 8 labs), Complex Queries (8 lessons, 4 labs), Database Design (15 lessons, 2 labs), Indexes\n• Interactive lessons' },
    { type: 'student_tips', content: '• Go through material MULTIPLE TIMES and do coding practices more than once\n• Partner with instructors' },
  ],
  'D522': [
    { type: 'competencies', content: '• Applies Python principles and syntax to manage variables, data structures, and operators and to perform IT tasks
• Creates Python scripts using control structures to automate system tasks
• Integrates Python scripts, modules, packages, and libraries to automate networking tasks and processes' },
    { type: 'structure', content: '• V1: 15 sections via Zybooks — covers file handling, log analysis, subprocesses for real-world IT\n• V2 (effective 6/22/26): 3 sections, OA replaced by PA, whole new content\n• V2 PA: Design project from scratch — Python fundamentals, Git and GitLab environments\n• V2 Task 1: DNS outage resolution using Python automation\n• V2 Task 2: Monitoring solution for DNS issues with alerting and ticketing' },
    { type: 'student_tips', content: '• V1 OA: 20 multiple choice + 10 coding questions\n• D278 helps students with zero coding experience\n• Programming Center: sharepoint link\n• Use the 100 Days of Coding\n• Per Cyber Group: Definitely take D522 BEFORE D385!' },
  ],
  'D492': [
    { type: 'competencies', content: '• Applies appropriate data acquisition and manipulation techniques to address businesses\' data requirements for analysis
• Applies basic concepts to analyze data types and data structures
• Applies data analysis techniques and tools to address a business need
• Applies data management concepts to ensure the accuracy and quality of data
• Applies data visualization techniques to communicate a business need
• Selects the data visualization technique to communicate a business requirement' },
    { type: 'pacing', content: '• Speedy: 4 weeks max\n• Steady: 5-7 weeks\n• Deliberate: 8-10 weeks\n• Can finish in 3 weeks doing 2 sections/week' },
    { type: 'cert', content: '• Cert: CompTIA Data+\n• "Easiest cert test" compared to A+ (per instructor)\n• No calculator allowed — do work by hand\n• Goal: at or close to 85% on CertMaster Practice test\n• 5-10% of questions are poorly worded / best guess — test design issue' },
    { type: 'structure', content: '• 6 sections, 18-19 lessons via CertMaster\n• Flow: Read, Watch, Lab(s), Practice Activities (flashcards, etc.)\n• Covers: data types, acquisition/manipulation, analysis, visualization, selection, management\n• 20% course overlap with D426 Data Mgmt Foundations' },
    { type: 'student_tips', content: '• Use Course Materials + Udemy practice tests\n• Don\'t worry about optional labs — focus on practice tests and PBQs in CertMaster\n• Helps students be more marketable\n• Mike Chapple LinkedIn Learning: Data+ Cert Prep' },
    { type: 'cert', content: '• Exam: CompTIA Data+ (DA0-001)\n• 90 questions max, 90 minutes\n• Passing score: 675/900\n• No calculator allowed — do work by hand\n• Exam location: Webcam or PearsonVUE\n• Renewal: Every 3 years via CE or retake\n• Waiting period: 0, 14, 14 days\n• "Easiest cert test" compared to A+ per instructors\n• 5-10% of questions are poorly worded (test design issue) — best guess' },
  ],
  'D385': [
    { type: 'competencies', content: '• Configures security authentication for REST and APIs
• Develops mitigation solutions for security vulnerabilities
• Evaluates application and network logs for performance, availability, and security vulnerabilities' },
    { type: 'pacing', content: '• Per Doug: 4 weeks\n• Complete AFTER D522 Python (and per Cyber Group: DEFINITELY take D522 first!)' },
    { type: 'prereqs', content: '• Complete AFTER: D522 Python' },
    { type: 'structure', content: '• 4 sections: Overview, Application & Network Logs, Security Authentication, Mitigation Solutions\n• Look for "Practice Area" at end of sections — has practice labs that mirror assessments\n• Requires students to memorize a lot of info\n• Be careful with spacing — affects coding accuracy' },
    { type: 'student_tips', content: '• Pre-assessment will NOT give helpful info for the coding problem section\n• Encourage struggling students to connect with a Peer Coach — even weekly\n• Per Mario: Tricky course; OA to be redesigned\n• Per Lindsey Caraher: Task 1 "Summarize 5 distinct issues" — run the vulnerabilities report in Python project, read report, pick issues from there\n• Email instructor group: cmsoftware@wgu.edu' },
  ],
  'D831': [
    { type: 'competencies', content: '• Describes the types of artificial intelligence for decision-making in real-world applications
• Explains best practices for managing secure AI systems within an organization
• Explains how the collection, wrangling, and cleaning of data impacts AI/ML models' },
    { type: 'structure', content: '• 14 sections via Zybooks\n• All reading and charts — each part is short (1 page or less)\n• Includes knowledge checks and labs throughout\n• OA course' },
  ],
  'D340': [
    { type: 'competencies', content: '• Applies controls and procedures for software and system security
• Applies improvement techniques and automation based on system monitoring and threat hunting
• Applies incident response procedures based on digital forensic analysis
• Applies security concepts to risk mitigation with regards to privacy and protection
• Manages security testing and response in defense of organizational threats and vulnerabilities' },
    { type: 'pacing', content: '• Speedy: 3-4 weeks\n• Steady: 4-8 weeks\n• Deliberate: 8-10 weeks\n• Average time: 9 weeks' },
    { type: 'cert', content: '• Cert: CompTIA CySA+\n• Goal: engage in all course materials, earn 90%+ on all practice sets, PBQs, assessments, labs\n• CertMaster Practice Test can be taken 2x — different test generated on 2nd attempt\n• Uses CertMaster curriculum' },
    { type: 'prereqs', content: '• Complete AFTER: D316, D317, D315, D325, D329, D829, C845, D830, D832, D522' },
    { type: 'structure', content: '• 4 sections via CertMaster\n• Section 1: Threats and Security Intelligence\n• Section 2: Apply Security Solutions\n• Section 3: Demonstrating Incident Response Communication\n• Section 4: Cert Exam Practice with optional videos' },
    { type: 'student_tips', content: '• Udemy: Jason Dion Complete Course and Practice Exams (7 total) — take screenshots and email to instructor to request voucher\n• LinkedIn Learning and Pluralsite also have good training series and labs\n• TryHackMe: free version — "Learn" tab and "Paths" tab\n• TryHackMe reduced cost with WGU email: $10/month' },
    { type: 'cert', content: '• Exam: CompTIA CySA+ (CS0-003)\n• 85 questions max, 165 minutes\n• Passing score: 750/900\n• Exam location: Webcam or PearsonVUE\n• Renewal: Every 3 years via CE or retake\n• Waiting period: 0, 14, 14 days\n• Stackable cert earned: CompTIA Security Analytics Professional\n• Intense but less so than PenTest+ per Bridge the Cyber Gap session' },
  ],
  'D320': [
    { type: 'competencies', content: '• Conducts risk analysis and risk management in alignment with disaster recovery and business continuity plans
• Identifies legal, compliance, and ethical concerns within a cloud environment
• Identifies security policies and procedures for cloud applications
• Implements operational capabilities, procedures, and training in relation to organizational needs
• Implements secure solutions in cloud service models
• Safeguards cloud data with identity and access management' },
    { type: 'pacing', content: '• Speedy: 4 weeks or less\n• Steady: 7 weeks\n• Deliberate: 7-8 weeks\n• Average time: 6 weeks' },
    { type: 'cert', content: '• Optional CCSP voucher after passing OA — only 1 voucher available\n• Lessons 1-10: Read CCSP Official Study Guide\n• Lessons 11-12: Review 6 video courses from LinkedIn Learning (cert prep)\n• Additional quizzes via Sybex Test Preparation on Wiley Efficient Learning app' },
    { type: 'prereqs', content: '• Complete AFTER: D316, D317, D315, D325, D329, D829, C845, D830, D832, D522' },
    { type: 'structure', content: '• 7 sections, each with learning objectives, readings, knowledge check, summary\n• Lessons 5 and 6 tend to require extra time\n• Per Robert: Nearly all material covered in previous courses — students tend to do well quickly' },
    { type: 'cert', content: '• Exam: ISC2 CCSP (Certified Cloud Security Professional)\n• 150 questions, 4 hours\n• Passing score: 700/1000\n• Computer adaptive testing (CAT format)\n• Voucher: optional, 1 voucher available after passing OA\n• Exam location: ISC2 / PearsonVUE\n• Renewal: Every 3 years — requires 90 CPE credits\n• 5 years of paid work experience required for full CCSP designation' },
  ],
  'D332': [
    { type: 'competencies', content: '• Defines the scope and planning for procurement of penetration testing engagements
• Develops penetration testing techniques in exploitation of physical, digital, and social vulnerabilities
• Performs cyber reconnaissance techniques for information gathering and vulnerability identification
• Reports the results of cybersecurity assessments with recommended actions
• Simulates attacks and responses on an organization\'s security infrastructure' },
    { type: 'pacing', content: '• Speedy: 4 weeks\n• Steady: 4-6 weeks\n• Deliberate: 6-8 weeks\n• Average time: 7 weeks (top students with 5+ years experience: 45 days; typical: 80 days)\n• 68% pass rate at WGU (outside WGU: 65%)' },
    { type: 'cert', content: '• Cert: CompTIA PenTest+\n• 90 questions, 165 minutes, score to pass: 750/900, PT0-003 version\n• Difficulty: intermediate — best after 3-4 years industry experience\n• Retail: $470 / WGU: $250\n• Retake cost after failing 2nd attempt = WGU pays' },
    { type: 'prereqs', content: '• Complete AFTER: D316, D317, D315, D325, D329, D829, C845, D830, D832, D522, D385, D831, D340, D320' },
    { type: 'structure', content: '• 10 sections + Exam Readiness via CompTIA platform\n• Heavy reading, limited interactive activities, minimal videos\n• 37 labs total — complete 95% with 90%+ scores\n• Students must know Linux command lines\n• Certmaster is good but use additional resources' },
    { type: 'cert', content: '• VOUCHER REQUIREMENTS (effective Feb 2026):\n  1. Live call with any D332 instructor (required before voucher — review exam rigor, not a quiz)\n  2. CertMaster Perform Labs: 90%+ overall completion\n  3. CertMaster Perform A.2.6 full-length practice exam: 90%+\n• This is cumulative: Security+, Linux+, CySA+ content' },
    { type: 'student_tips', content: '• Start with CertMaster material and labs for foundation\n• Watch Hank Hackerson\'s Pentest playlist on YouTube\n• TryHackMe PenTest+ pathway (HTTP and nmap rooms)\n• All 6 Jason Dion PenTest+ 003 practice exams on Udemy (aim for 80%+)\n• ChatGPT for scripting practice questions with inputs/outputs\n• PocketPrep for drilling questions on the go (1,000 questions, costs money)\n• Per Jon Pham: tryhackme.com for more experience\n• Mental shift: from defense to offense' },
    { type: 'cert', content: '• Exam: CompTIA PenTest+ (PT0-003)\n• 90 questions max, 165 minutes\n• Passing score: 750/900\n• Exam location: Webcam or PearsonVUE\n• Renewal: Every 3 years via CE or retake\n• Waiting period: 0, 14, 14 days\n• Difficulty: Intermediate — best with 3-4 years industry experience\n• 68% pass rate at WGU (65% outside WGU — DO NOT share with students)\n• WGU cost: $250 / Retail: $470 (do not tell students exact number)\n• Cumulative exam: pulls from Security+, Linux+, CySA+ content\n• Stackable certs: CompTIA Network Vulnerability Assessment Professional, CompTIA Network Security Professional' },
  ],
  'D833': [
    { type: 'competencies', content: '• Creates a project proposal to convince stakeholders to implement the security solution
• Creates a technical report for a fully functional system to solve real-world scenarios
• Creates an executive summary of a security solution directed to IT and business professionals' },
    { type: 'pacing', content: '• 4-6 weeks to complete\n• FINAL course in program — should be completed LAST\n• V2 rolls out 6/29/26 for students starting on or after that date (4 job role scenarios)' },
    { type: 'structure', content: '• 3 tasks:\n  - Task 1: Formal Proposal/Topic Selection (requires instructor approval)\n  - Task 2: Executive Summary/Project Proposal (has peer review — can take up to 7 days)\n  - Task 3: Technical Report/Post-implementation Report\n• Must be written in proper APA format\n• Templates available' },
    { type: 'student_tips', content: '• Join WGU Connect\n• Access Capstone Excellence Archive for examples\n• Technical Report Structure Overview available\n• Peer review piece added to Task 2\n• If former Capstone (C769) is completed, student does NOT do this one' },
  ],
  'D841': [
    { type: 'general', content: '• Daggered course\n• 3 sections: Fundamental Issues, Laws Influencing Information Security, Security & Privacy in Organizations\n• Flow: Intro, Learning Objectives, Readings & Resources, Knowledge Check, Summary' },
  ],
  'C843': [
    { type: 'structure', content: '• 2 sections: Welcome (must have Cengage Account), Info Security Management (5 lessons)\n• Has readings, some videos, and a PA' },
  ],
  'C844': [
    { type: 'general', content: '• DAGGERED COURSE\n• 4 sections: Welcome, Cellular & Mobile Technologies, Wireless Technologies, Mapping & Monitoring\n• Content from digital textbook with supplemental videos and labs\n• 6 total labs\n• Flow: Intro, Learning Objectives, Readings & Resources, Knowledge Check, Summary' },
  ],
  'D334': [
    { type: 'general', content: '• DAGGERED COURSE\n• 4 sections: Course overview, Foundations of Cryptography, Applications of Cryptography, Course Summary\n• Has videos, readings, knowledge checks' },
    { type: 'student_tips', content: '• Per Bryan Gilmore: Lots of memorization — digital flashcards helped\n• Upload picture with one place missing, try to remember what was missing\n• Use Anki (desktop app, similar to Quizlet but no ads)' },
  ],
  'D335': [
    { type: 'general', content: '• DAGGERED COURSE\n• 30 sections via Zybooks\n• Sections 1-12: lessons with labs (required)\n• Sections 13-18: optional lessons with labs\n• Sections 19-28: optional labs\n• Sections 29-30: 2 practice tests\n• Interactive Kyron modules for programming practice via real-world scenarios and AI discussions' },
    { type: 'student_tips', content: '• Do NOT memorize — practice with programming techniques\n• Complete the optional labs too' },
  ],
  'D372': [
    { type: 'general', content: '• DAGGERED COURSE with new migration\n• 3 sections: Theoretical Foundations, Developing a Systems Thinking Mindset, Solving Complex Problems in IT\n• Lessons include readings' },
  ],
  'D430': [
    { type: 'general', content: '• DAGGERED COURSE\n• 7 sections via readings and videos\n• Instructor provides 4-week pacing plan\n• Flow: Intro, Learning, Knowledge Check, Summary' },
  ],
  'D427': [
    { type: 'general', content: '• DAGGERED COURSE — WGU OA with pre-assessment\n• 6 sections via Zybooks — Section 1 is very long\n• V3: More streamlined resources, videos added, practice problems added\n• Pre-assessment and final assessment include a SQL Reference Sheet — syntax does NOT need to be memorized\n• Student must understand WHICH command to use but not memorize all syntax' },
    { type: 'student_tips', content: '• Some Cyber students may opt to wait and take D492 Data+ cert instead of attempting D427 this term\n• If student hasn\'t attempted OA and funding won\'t be impacted: consider dropping D427 and accelerating another course to stay above 12 CUs' },
  ],
  'D833_capstone': [],
};

// ── Note type labels ──────────────────────────────────────────────────────

const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  general:      '📌 General',
  pacing:       '⏱ Pacing',
  structure:    '📋 Course Structure',
  cert:         '🏆 Cert Info',
  student_tips: '💡 Student Tips',
  resources:    '🔗 Resources',
  prereqs:      '🔒 Prerequisites',
  competencies: '🎯 Competencies',
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

// ── Main Component ─────────────────────────────────────────────────────────

export default function CourseNotes() {
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [notes, setNotes]               = useState<CourseNote[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [newType, setNewType]           = useState<NoteType>('student_tips');
  const [newContent, setNewContent]     = useState('');
  const [saving, setSaving]             = useState(false);
  const [preloaded, setPreloaded]       = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editContent, setEditContent]   = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [filterType, setFilterType]     = useState<NoteType | 'all'>('all');

  const selectedCourse = COURSES.find(c => c.code === selectedCode);

  // ── Load notes for selected course ───────────────────────────────────────
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

  // ── Seed pre-loaded notes if none exist ───────────────────────────────────
  const seedPreloaded = useCallback(async (code: string) => {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return;

    const { data: existing } = await supabase
      .from('course_notes')
      .select('id')
      .eq('course_code', code)
      .limit(1);

    if (existing && existing.length > 0) return; // already seeded

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
    setPreloaded(true);
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    (async () => {
      await seedPreloaded(selectedCode);
      await loadNotes(selectedCode);
    })();
  }, [selectedCode, loadNotes, seedPreloaded]);

  // ── Add note ──────────────────────────────────────────────────────────────
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

  // ── Edit note ─────────────────────────────────────────────────────────────
  async function handleEdit(note: CourseNote) {
    if (!supabase) return;
    await supabase.from('course_notes').update({
      content: editContent,
      updated_at: new Date().toISOString(),
    }).eq('id', note.id);
    setEditingId(null);
    await loadNotes(selectedCode);
  }

  // ── Delete note ───────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!supabase || !confirm('Delete this note?')) return;
    await supabase.from('course_notes').delete().eq('id', id);
    await loadNotes(selectedCode);
  }

  // ── Filter notes ──────────────────────────────────────────────────────────
  const filtered = notes.filter(n => {
    const matchType = filterType === 'all' || n.note_type === filterType;
    const matchSearch = !searchTerm || n.content.toLowerCase().includes(searchTerm.toLowerCase());
    return matchType && matchSearch;
  });

  // Group filtered notes by type for display
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
          <p>BSCSIA 202509 — reference notes by course</p>
        </div>
      </div>

      {/* Course selector */}
      <section className="panel">
        <div className="panel-head">
          <h2><BookOpen size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Select a Course</h2>
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
            <optgroup key={term} label={term === 0 ? '📌 Program Reference' : `Term ${term}`}>
              {courses.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.title}{c.cu > 0 ? ` (${c.type}, ${c.cu} CU)` : ''}{c.cert ? ` · ${c.cert}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {/* Course info banner */}
      {selectedCourse && (
        <div className="brief-item" style={{
          borderLeft: '4px solid var(--purple)',
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
          marginBottom: 12
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{selectedCourse.code} — {selectedCourse.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Term {selectedCourse.term} · {selectedCourse.type} · {selectedCourse.cu} CUs
              {selectedCourse.cert && ` · 🏆 ${selectedCourse.cert}`}
            </div>
          </div>
        </div>
      )}

      {/* Notes area */}
      {selectedCode && (
        <>
          {/* Filter + search bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <input
              placeholder="Search notes…"
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

          {/* Add note form */}
          {showAdd && (
            <section className="panel" style={{ borderLeft: '4px solid var(--purple)' }}>
              <div className="panel-head">
                <h2>Add a note for {selectedCode}</h2>
                <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Category
              </label>
              <select value={newType} onChange={e => setNewType(e.target.value as NoteType)} style={{ width: '100%', marginBottom: 10 }}>
                {(Object.entries(NOTE_TYPE_LABELS) as [NoteType, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                Content — use bullet points (• or –) for easy scanning
              </label>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                placeholder="• Key info here&#10;• Another point&#10;• Student tip or resource"
                style={{ minHeight: 120, fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn primary" onClick={handleAdd} disabled={saving || !newContent.trim()}>
                  {saving ? <><RefreshCw size={13} className="spin" /> Saving…</> : <><Save size={13} /> Save note</>}
                </button>
              </div>
            </section>
          )}

          {/* Notes display */}
          {loading ? (
            <div className="brief-item" style={{ color: 'var(--muted)' }}>
              <RefreshCw size={13} className="spin" /> Loading notes…
            </div>
          ) : filtered.length === 0 ? (
            <div className="brief-item" style={{ color: 'var(--muted)' }}>
              No notes found for this course yet. Click "Add note" to start building your reference.
            </div>
          ) : (
            (Object.entries(NOTE_TYPE_LABELS) as [NoteType, string][])
              .filter(([type]) => grouped[type]?.length > 0)
              .map(([type, label]) => (
                <section key={type} className="panel" style={{ borderLeft: `4px solid ${NOTE_TYPE_COLORS[type]}` }}>
                  <div className="panel-head">
                    <h2 style={{ color: NOTE_TYPE_COLORS[type] }}>{label}</h2>
                  </div>
                  {grouped[type].map(note => (
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
                        <div style={{ position: 'relative' }}>
                          <div style={{
                            fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                            background: 'var(--surface-1)', borderRadius: 8, padding: '8px 10px',
                          }}>
                            {note.content}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn ghost tiny"
                              onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                            >Edit</button>
                            <button
                              className="btn ghost tiny"
                              onClick={() => handleDelete(note.id)}
                              style={{ color: 'var(--red)' }}
                            >Delete</button>
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

      {/* Empty state */}
      {!selectedCode && (
        <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
          <FileText size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Select a course from the dropdown above to see your notes and tips for it.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
            All 38 BSCSIA 202509 courses are pre-loaded with notes from your course notes document.
          </p>
        </section>
      )}
    </>
  );
}
