"use strict";

(() => {
  const SECTION_BY_NUMBER = (number) => {
    if (number <= 14) return "rights";
    if (number <= 22) return "restrictions";
    if (number <= 25) return "taxOther";
    if (number <= 45) return "business";
    return "taxOther";
  };

  const RAW_EXAMS = [
    {
      id: "2025",
      year: 2025,
      label: "令和7年度（2025）",
      questionUrl: "https://goukaku.retio.or.jp/exam/pdf_2025_1_UWbaZCx6hm/2025question.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2025/12/R7_question_answer.pdf",
      answers: [
        3, 3, 3, 4, 4, 1, 1, 2, 1, 3,
        3, 3, 3, 1, 4, 4, 2, 2, 2, 4,
        4, 4, 1, 2, 1, 4, 1, 2, 2, 3,
        4, 2, 3, 3, 1, 4, 4, 3, 4, 3,
        1, 2, 4, 2, 4, 2, 3, 2, 1, 1
      ]
    },
    {
      id: "2024",
      year: 2024,
      label: "令和6年度（2024）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2025/03/R6_question_answer.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2025/03/R6_question_answer.pdf",
      answers: [
        1, 4, 3, 4, 2, 4, 1, 1, 2, 4,
        3, 3, 1, 3, 4, 1, 2, 2, 3, 2,
        1, 4, 2, 2, 3, 3, 4, 2, 4, 4,
        1, 3, 3, 3, 2, 4, 3, 4, 4, 2,
        1, 2, 4, 1, 2, 1, 4, 1, 2, 3
      ]
    },
    {
      id: "2023",
      year: 2023,
      label: "令和5年度（2023）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2025/03/R5_qestion_answer%E3%80%80.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2025/03/R5_qestion_answer%E3%80%80.pdf",
      answers: [
        1, 1, 2, 4, 4, 3, 3, 3, 2, 3,
        4, 3, 2, 2, 4, 1, 3, 1, 1, 4,
        2, 1, 1, 4, 4, 3, 4, 3, 2, 1,
        4, 4, 1, 3, 4, 3, 3, 2, 2, 4,
        2, 3, 4, 1, 4, 2, 2, 1, 2, 3
      ]
    },
    {
      id: "2022",
      year: 2022,
      label: "令和4年度（2022）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R4-q_a.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R4-q_a.pdf",
      answers: [
        3, 3, 4, 1, 2, 3, 4, 3, 1, 2,
        3, 1, 1, 2, 3, 2, 3, 3, 4, 1,
        4, 3, 3, 2, 2, 2, 1, 1, 3, 3,
        1, 1, 2, 4, 4, 1, 2, 4, 4, 2,
        2, 2, 2, 4, 3, 1, 4, [1, 2, 3, 4], 2, 4
      ]
    },
    {
      id: "2021-12",
      year: 2021,
      session: "12",
      label: "令和3年度 12月試験（2021）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/12/R3-question_002.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/12/R3-question_002.pdf",
      answers: [
        4, 3, 2, 4, 3, 1, 4, 2, 3, 1,
        3, 2, 2, 2, 4, 3, 3, 2, 1, 1,
        4, 1, 2, 1, 2, 3, 4, 1, 3, 3,
        2, 1, 2, 1, 4, 4, 2, 3, 3, 2,
        1, 3, 1, [2, 3], 4, 1, 4, 4, 2, 4
      ]
    },
    {
      id: "2021-10",
      year: 2021,
      session: "10",
      label: "令和3年度 10月試験（2021）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/12/R3-question.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R3-answer.pdf",
      answers: [
        1, 2, 4, 1, 4, 2, 3, 1, 1, 2,
        3, 2, 4, 3, 3, 2, 4, 2, 4, 3,
        3, 4, 1, 1, 3, 2, 4, 4, 4, 2,
        3, 1, 1, 2, 3, 1, 3, 4, 1, 3,
        1, 2, 4, 2, 3, 1, 2, 3, 4, 3
      ]
    },
    {
      id: "2020-12",
      year: 2020,
      session: "12",
      label: "令和2年度 12月試験（2020）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R2-question_002.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R2-question_002.pdf",
      answers: [
        3, 1, 4, 2, 2, 1, 2, 3, 1, 4,
        4, 3, 3, 2, 2, 2, 1, 4, 1, 3,
        3, 4, 1, 3, 1, 2, 3, 1, 3, 2,
        3, 4, 4, 4, 3, 3, 1, 1, 1, 4,
        2, 1, 4, 2, 4, 4, 2, 2, 3, 3
      ]
    },
    {
      id: "2020-10",
      year: 2020,
      session: "10",
      label: "令和2年度 10月試験（2020）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R2-question.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R2-question.pdf",
      answers: [
        1, 4, 2, 3, 1, 3, 2, 2, 3, 2,
        4, 3, 4, 1, 4, 2, 1, 3, 3, 2,
        1, 1, 3, 4, 4, 3, 2, 3, 3, 4,
        1, 1, 1, 4, 3, 4, 1, 4, 2, 2,
        3, [1, 4], 2, 4, 2, 2, 1, 3, 4, 3
      ]
    },
    {
      id: "2019",
      year: 2019,
      label: "令和元年度（2019）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R1-q_a.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/R1-q_a.pdf",
      answers: [
        1, 4, 1, 4, 2, 2, 1, 2, 4, 1,
        3, 4, 3, 3, 4, 1, 4, 2, 3, 1,
        1, 3, 2, 4, 3, 4, 1, 4, 3, 4,
        1, 4, 3, 2, 4, 2, 3, 2, 3, 2,
        1, 1, 2, 3, 1, 1, 4, 2, 3, 4
      ]
    },
    {
      id: "2018",
      year: 2018,
      label: "平成30年度（2018）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/H30-q_a.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/H30-q_a.pdf",
      answers: [
        4, 4, 3, 2, 3, 1, 2, 1, 3, 4,
        2, 3, 1, 4, 1, 4, 4, 3, 2, 4,
        3, 1, 2, 3, 1, 2, 4, 1, 2, 4,
        3, 1, 4, 2, 3, 3, 2, 1, 4, 2,
        3, 4, 1, 2, 3, 1, 2, 3, 4, 3
      ]
    },
    {
      id: "2017",
      year: 2017,
      label: "平成29年度（2017）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/H29-q_a.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/H29-q_a.pdf",
      answers: [
        3, 4, 3, 2, 4, 3, 3, 2, 3, 1,
        2, 4, 2, 3, 4, 1, 2, 4, 1, 4,
        4, 1, 1, 3, 3, 1, 1, 4, 4, 1,
        4, 1, 2, 3, 3, 4, 3, 2, 2, 3,
        2, 4, 1, 4, 2, 3, 4, 2, 4, 1
      ]
    },
    {
      id: "2016",
      year: 2016,
      label: "平成28年度（2016）",
      questionUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/H28-q_a.pdf",
      answerSourceUrl: "https://www.retio.or.jp/wp-content/uploads/2024/10/H28-q_a.pdf",
      answers: [
        4, 4, 3, 2, 3, 3, 3, 1, 2, 4,
        1, 2, 2, 1, 3, 1, 4, 1, 4, 1,
        4, 3, 2, 3, 2, 1, 3, 4, 3, 4,
        4, 1, 3, 2, 4, 4, 2, 1, 2, 1,
        3, 4, 2, 2, 3, 2, 4, 1, 3, 1
      ]
    }
  ];

  function freezeAnswer(answer) {
    return Array.isArray(answer) ? Object.freeze([...answer]) : answer;
  }

  const EXAMS = Object.freeze(
    RAW_EXAMS.map((exam) => Object.freeze({
      ...exam,
      source: "RETIO",
      lawStatus: "historical",
      sourceCheckedAt: "2026-07-31",
      answers: Object.freeze(exam.answers.map(freezeAnswer))
    }))
  );
  const EXAM_BY_ID = Object.freeze(
    Object.fromEntries(EXAMS.map((exam) => [exam.id, exam]))
  );

  function acceptedAnswer(expected, selected) {
    const value = Number(selected);
    return Array.isArray(expected)
      ? expected.includes(value)
      : Number(expected) === value;
  }

  function scoreAnswers(examId, answers = {}) {
    const exam = EXAM_BY_ID[String(examId || "")];
    if (!exam) return null;
    const sectionScores = {
      rights: 0,
      restrictions: 0,
      business: 0,
      taxOther: 0
    };
    let score = 0;
    exam.answers.forEach((expected, index) => {
      const number = index + 1;
      if (!acceptedAnswer(expected, answers[number])) return;
      score += 1;
      sectionScores[SECTION_BY_NUMBER(number)] += 1;
    });
    return { score, sectionScores };
  }

  const api = {
    EXAMS,
    EXAM_BY_ID,
    SECTION_BY_NUMBER,
    acceptedAnswer,
    scoreAnswers
  };

  if (typeof window !== "undefined") window.TAKKEN_OFFICIAL_EXAMS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
