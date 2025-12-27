// Quiz Game Logic
const questions = [
  {
    question: "What is the default port for PostgreSQL?",
    options: ["5432", "3306", "8080", "27017"],
    correct: 0,
    explanation: "PostgreSQL uses port 5432 by default. MySQL uses 3306, HTTP uses 8080, and MongoDB uses 27017."
  },
  {
    question: "Which AWS service is best for managed PostgreSQL databases?",
    options: ["RDS", "DynamoDB", "Redshift", "ElastiCache"],
    correct: 0,
    explanation: "Amazon RDS (Relational Database Service) provides managed PostgreSQL instances with automated backups, patching, and monitoring."
  },
  {
    question: "What is the purpose of a PostgreSQL WAL (Write-Ahead Log)?",
    options: [
      "To improve query performance",
      "To ensure data durability and recovery",
      "To compress database files",
      "To manage user connections"
    ],
    correct: 1,
    explanation: "WAL ensures data durability by writing changes to a log before applying them to data files, enabling point-in-time recovery."
  },
  {
    question: "Which AWS service helps reduce costs by automatically stopping idle resources?",
    options: ["CloudWatch", "Cost Explorer", "AWS Budgets", "AWS Savings Plans"],
    correct: 1,
    explanation: "While Cost Explorer helps analyze costs, AWS Auto Scaling and Lambda can stop idle resources. AWS Savings Plans provide discounts for committed usage."
  },
  {
    question: "What is the maximum number of connections allowed in a default PostgreSQL installation?",
    options: ["100", "500", "Unlimited", "Depends on max_connections setting"],
    correct: 3,
    explanation: "PostgreSQL's max_connections parameter (default 100) controls the maximum number of concurrent connections, but it can be configured."
  },
  {
    question: "Which PostgreSQL feature helps improve query performance by storing pre-computed results?",
    options: ["Indexes", "Materialized Views", "Foreign Keys", "Triggers"],
    correct: 1,
    explanation: "Materialized Views store pre-computed query results, significantly improving performance for complex analytical queries."
  },
  {
    question: "What does AWS RDS Multi-AZ provide?",
    options: [
      "Read replicas in different regions",
      "Synchronous replication for high availability",
      "Automatic scaling",
      "Cost optimization"
    ],
    correct: 1,
    explanation: "Multi-AZ provides synchronous replication to a standby instance in a different Availability Zone for high availability and automatic failover."
  },
  {
    question: "Which PostgreSQL command is used to analyze table statistics?",
    options: ["ANALYZE", "EXPLAIN", "VACUUM", "REINDEX"],
    correct: 0,
    explanation: "ANALYZE updates table statistics used by the query planner to choose optimal execution plans."
  },
  {
    question: "What is the primary benefit of using AWS Reserved Instances?",
    options: [
      "Better performance",
      "Cost savings (up to 72% discount)",
      "Higher availability",
      "Automatic backups"
    ],
    correct: 1,
    explanation: "Reserved Instances provide significant cost savings (up to 72%) compared to On-Demand pricing in exchange for a 1-3 year commitment."
  },
  {
    question: "Which PostgreSQL configuration parameter controls the shared buffer size?",
    options: ["shared_buffers", "work_mem", "maintenance_work_mem", "effective_cache_size"],
    correct: 0,
    explanation: "shared_buffers controls the amount of memory PostgreSQL uses for caching data pages, typically set to 25% of total RAM."
  },
  {
    question: "What is the purpose of AWS CloudWatch?",
    options: [
      "Cost management",
      "Monitoring and observability",
      "Database management",
      "Security scanning"
    ],
    correct: 1,
    explanation: "CloudWatch provides monitoring, logging, and alerting for AWS resources and applications."
  },
  {
    question: "Which PostgreSQL feature prevents phantom reads?",
    options: ["READ COMMITTED", "SERIALIZABLE", "REPEATABLE READ", "READ UNCOMMITTED"],
    correct: 2,
    explanation: "REPEATABLE READ isolation level prevents phantom reads by ensuring that a transaction sees a consistent snapshot of data."
  },
  {
    question: "What is the recommended approach for PostgreSQL backup in AWS RDS?",
    options: [
      "Manual pg_dump only",
      "Automated snapshots + point-in-time recovery",
      "Copying data files",
      "Using S3 only"
    ],
    correct: 1,
    explanation: "AWS RDS provides automated daily snapshots and enables point-in-time recovery, which is the recommended backup strategy."
  },
  {
    question: "Which AWS service is used for Infrastructure as Code?",
    options: ["CloudFormation", "CloudWatch", "CodePipeline", "CodeCommit"],
    correct: 0,
    explanation: "AWS CloudFormation allows you to define and provision AWS infrastructure using templates (Infrastructure as Code). Terraform is also popular."
  },
  {
    question: "What does VACUUM do in PostgreSQL?",
    options: [
      "Removes dead tuples and reclaims space",
      "Backs up the database",
      "Creates indexes",
      "Optimizes queries"
    ],
    correct: 0,
    explanation: "VACUUM removes dead tuples (from updates/deletes) and reclaims storage space, preventing table bloat."
  }
];

let currentQuestion = 0;
let score = 0;
let selectedAnswer = null;
let questionsToShow = 10;

// Shuffle and select random questions
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

let gameQuestions = shuffleArray(questions).slice(0, questionsToShow);

function initGame() {
  currentQuestion = 0;
  score = 0;
  selectedAnswer = null;
  gameQuestions = shuffleArray(questions).slice(0, questionsToShow);
  document.getElementById('totalQuestions').textContent = gameQuestions.length;
  document.getElementById('resultScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'block';
  loadQuestion();
}

function loadQuestion() {
  if (currentQuestion >= gameQuestions.length) {
    showResults();
    return;
  }

  const question = gameQuestions[currentQuestion];
  selectedAnswer = null;

  document.getElementById('questionNumber').textContent = `Question ${currentQuestion + 1} of ${gameQuestions.length}`;
  document.getElementById('questionNum').textContent = currentQuestion + 1;
  document.getElementById('questionText').textContent = question.question;
  document.getElementById('score').textContent = score;
  
  const progress = ((currentQuestion) / gameQuestions.length) * 100;
  document.getElementById('progressBar').style.width = progress + '%';

  const optionsList = document.getElementById('optionsList');
  optionsList.innerHTML = '';

  question.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.className = 'option-btn';
    button.textContent = option;
    button.onclick = () => selectAnswer(index);
    optionsList.appendChild(button);
  });

  document.getElementById('submitBtn').style.display = 'inline-flex';
  document.getElementById('nextBtn').style.display = 'none';
}

function selectAnswer(index) {
  if (document.getElementById('submitBtn').style.display === 'none') return;
  
  selectedAnswer = index;
  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach((btn, i) => {
    btn.classList.remove('selected');
    if (i === index) {
      btn.classList.add('selected');
    }
  });
}

function submitAnswer() {
  if (selectedAnswer === null) {
    alert('Please select an answer!');
    return;
  }

  const question = gameQuestions[currentQuestion];
  const buttons = document.querySelectorAll('.option-btn');
  
  buttons.forEach((btn, index) => {
    btn.disabled = true;
    if (index === question.correct) {
      btn.classList.add('correct');
    } else if (index === selectedAnswer && index !== question.correct) {
      btn.classList.add('incorrect');
    }
  });

  if (selectedAnswer === question.correct) {
    score++;
    document.getElementById('score').textContent = score;
  }

  document.getElementById('submitBtn').style.display = 'none';
  document.getElementById('nextBtn').style.display = 'inline-flex';
}

function nextQuestion() {
  currentQuestion++;
  loadQuestion();
}

function showResults() {
  document.getElementById('gameScreen').style.display = 'none';
  document.getElementById('resultScreen').style.display = 'block';
  
  const percentage = Math.round((score / gameQuestions.length) * 100);
  document.getElementById('finalScore').textContent = `${score}/${gameQuestions.length}`;
  
  let message = '';
  if (percentage === 100) {
    message = 'Perfect Score! You\'re a PostgreSQL & AWS Expert! 🏆';
  } else if (percentage >= 80) {
    message = 'Excellent! You have strong knowledge! 🌟';
  } else if (percentage >= 60) {
    message = 'Good job! Keep learning! 👍';
  } else {
    message = 'Nice try! Practice makes perfect! 💪';
  }
  
  document.getElementById('resultMessage').textContent = message;

  // Update share links
  const shareText = `I scored ${score}/${gameQuestions.length} on the PostgreSQL & AWS Infrastructure Quiz! Can you beat my score? 🎯`;
  const shareUrl = encodeURIComponent('https://dishantmodh.com/game.html');
  const fullText = encodeURIComponent(shareText);

  document.getElementById('shareTwitter').href = 
    `https://twitter.com/intent/tweet?text=${fullText}&url=${shareUrl}`;
  
  document.getElementById('shareLinkedIn').href = 
    `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`;
  
  document.getElementById('shareWhatsApp').href = 
    `https://wa.me/?text=${fullText}%20${shareUrl}`;
}

// Event listeners
document.getElementById('submitBtn').addEventListener('click', submitAnswer);
document.getElementById('nextBtn').addEventListener('click', nextQuestion);
document.getElementById('playAgainBtn').addEventListener('click', initGame);

// Initialize game
initGame();

