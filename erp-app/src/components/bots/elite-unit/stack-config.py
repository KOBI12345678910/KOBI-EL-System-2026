"""
Technology Stack Configuration
Defines best practices, frameworks, and conventions for each supported stack
"""

from typing import Dict, List, Optional
from dataclasses import dataclass

@dataclass
class StackConfig:
    """Configuration for a technology stack"""
    name: str
    backend_lang: str
    backend_framework: str
    frontend_framework: str
    database: str
    orm_tool: str
    api_style: str  # REST, GraphQL, gRPC
    container: str
    container_orchestration: str
    iac_tool: str
    ci_cd_platform: str
    monitoring: List[str]
    logging: str
    caching: str
    message_queue: str
    
    # Best practices
    testing_framework: str
    code_formatter: str
    linter: str
    security_tools: List[str]
    
    # Code templates
    sample_endpoint: str
    sample_model: str
    sample_test: str
    terraform_example: str
    dockerfile_example: str
    github_actions_example: str

# ============================================
# Stack Definitions
# ============================================

PYTHON_FASTAPI = StackConfig(
    name="Python/FastAPI",
    backend_lang="Python 3.11+",
    backend_framework="FastAPI",
    frontend_framework="React/Next.js",
    database="PostgreSQL 15+",
    orm_tool="SQLAlchemy 2.0 + Alembic",
    api_style="REST",
    container="Docker",
    container_orchestration="Kubernetes",
    iac_tool="Terraform",
    ci_cd_platform="GitHub Actions",
    monitoring=["Prometheus", "Grafana", "New Relic"],
    logging="Python logging + ELK Stack",
    caching="Redis",
    message_queue="Celery/RabbitMQ",
    
    testing_framework="pytest",
    code_formatter="Black",
    linter="ruff + mypy",
    security_tools=["bandit", "Safety", "Trivy"],
    
    sample_endpoint="""
@router.post("/leads", response_model=LeadResponse)
async def create_lead(lead: LeadCreate, db: Session = Depends(get_db)):
    \"\"\"Create a new lead with validation\"\"\"
    db_lead = Lead(**lead.dict())
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    return db_lead
""",
    
    sample_model="""
from sqlalchemy import Column, String, Integer, DateTime
from database import Base

class Lead(Base):
    __tablename__ = "leads"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True)
    status = Column(String(50), default="new")
    created_at = Column(DateTime, server_default=func.now())
""",
    
    sample_test="""
def test_create_lead(client, db):
    response = client.post("/leads", json={
        "name": "John Doe",
        "email": "john@example.com"
    })
    assert response.status_code == 201
    assert response.json()["status"] == "new"
""",
    
    terraform_example="""
resource "aws_ecs_cluster" "main" {
  name = "lead-crm-cluster"
}

resource "aws_ecs_service" "fastapi" {
  name            = "fastapi-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.fastapi.arn
  desired_count   = 3
  launch_type     = "FARGATE"
}

resource "aws_rds_instance" "postgres" {
  engine               = "postgres"
  engine_version       = "15.2"
  instance_class       = "db.t4g.medium"
  allocated_storage    = 100
  db_name              = "lead_crm"
  backup_retention_period = 30
}
""",
    
    dockerfile_example="""
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
""",
    
    github_actions_example="""
name: CI/CD Pipeline
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: pytest --cov
      - run: ruff check .
      - run: bandit -r app/
"""
)

NODEJS_NESTJS = StackConfig(
    name="Node.js/NestJS",
    backend_lang="TypeScript 5.0+",
    backend_framework="NestJS",
    frontend_framework="React/Vue.js",
    database="PostgreSQL 15+ / MongoDB",
    orm_tool="TypeORM / Prisma",
    api_style="REST",
    container="Docker",
    container_orchestration="Kubernetes",
    iac_tool="Terraform / CDK",
    ci_cd_platform="GitHub Actions / GitLab CI",
    monitoring=["Prometheus", "Grafana", "Datadog"],
    logging="Winston + ELK",
    caching="Redis",
    message_queue="Bull / RabbitMQ",
    
    testing_framework="Jest",
    code_formatter="Prettier",
    linter="ESLint + TypeScript",
    security_tools=["Snyk", "npm audit", "Trivy"],
    
    sample_endpoint="""
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async create(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.create(createLeadDto);
  }
}
""",
    
    sample_model="""
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ default: 'new' })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
""",
    
    sample_test="""
describe('LeadsController', () => {
  let controller: LeadsController;
  let service: LeadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [LeadsService],
    }).compile();
    controller = module.get<LeadsController>(LeadsController);
  });

  it('should create a lead', async () => {
    const result = await controller.create({ name: 'John', email: 'john@example.com' });
    expect(result.status).toBe('new');
  });
});
""",
    
    terraform_example="""
resource "aws_eks_cluster" "main" {
  name    = "lead-crm-cluster"
  version = "1.28"
}

resource "aws_rds_cluster" "postgres" {
  cluster_identifier      = "lead-crm-db"
  engine                  = "aurora-postgresql"
  engine_version          = "15.2"
  database_name           = "lead_crm"
  master_username         = var.db_user
  backup_retention_period = 30
  enabled_cloudwatch_logs_exports = ["postgresql"]
}

resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "lead-crm-cache"
  engine               = "redis"
  node_type            = "cache.t4g.medium"
  num_cache_nodes      = 3
  parameter_group_name = "default.redis7"
}
""",
    
    dockerfile_example="""
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main"]
""",
    
    github_actions_example="""
name: CI/CD Pipeline
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm run lint
      - run: npx snyk test
"""
)

GO_ECHO = StackConfig(
    name="Go/Echo",
    backend_lang="Go 1.21+",
    backend_framework="Echo",
    frontend_framework="React/Vue.js",
    database="PostgreSQL 15+ / MySQL 8+",
    orm_tool="GORM",
    api_style="REST",
    container="Docker",
    container_orchestration="Kubernetes",
    iac_tool="Terraform / Pulumi",
    ci_cd_platform="GitHub Actions / CircleCI",
    monitoring=["Prometheus", "Grafana", "Datadog"],
    logging="Structured logging (zap) + ELK",
    caching="Redis",
    message_queue="NATS / RabbitMQ",
    
    testing_framework="Go testing + testify",
    code_formatter="gofmt",
    linter="golangci-lint",
    security_tools=["gosec", "Trivy"],
    
    sample_endpoint="""
func (h *Handler) CreateLead(c echo.Context) error {
  var lead models.Lead
  if err := c.Bind(&lead); err != nil {
    return c.JSON(http.StatusBadRequest, err)
  }
  
  if err := h.db.Create(&lead).Error; err != nil {
    return c.JSON(http.StatusInternalServerError, err)
  }
  
  return c.JSON(http.StatusCreated, lead)
}
""",
    
    sample_model="""
type Lead struct {
  ID        uint      `gorm:"primaryKey" json:"id"`
  Name      string    `gorm:"column:name" json:"name" validate:"required"`
  Email     string    `gorm:"column:email;unique" json:"email"`
  Status    string    `gorm:"column:status;default:new" json:"status"`
  CreatedAt time.Time `gorm:"autoCreateTime" json:"created_at"`
}
""",
    
    sample_test="""
func TestCreateLead(t *testing.T) {
  handler := &Handler{db: setupTestDB(t)}
  
  body := `{"name":"John","email":"john@example.com"}`
  req := httptest.NewRequest(http.MethodPost, "/leads", strings.NewReader(body))
  rec := httptest.NewRecorder()
  
  handler.CreateLead(echo.New().NewContext(req, rec))
  
  assert.Equal(t, http.StatusCreated, rec.Code)
}
""",
    
    terraform_example="""
resource "aws_eks_cluster" "main" {
  name    = "lead-crm-go"
  version = "1.28"
}

resource "aws_db_instance" "postgres" {
  identifier          = "lead-crm-db"
  engine              = "postgres"
  engine_version      = "15.2"
  instance_class      = "db.t4g.medium"
  allocated_storage   = 100
  backup_retention_period = 30
  skip_final_snapshot = false
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_description = "Lead CRM Cache"
  engine                         = "redis"
  engine_version                 = "7.0"
  node_type                      = "cache.t4g.medium"
  num_cache_clusters             = 3
}
""",
    
    dockerfile_example="""
FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o app .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/app .

EXPOSE 8080
CMD ["./app"]
""",
    
    github_actions_example="""
name: CI/CD Pipeline
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-go@v4
        with:
          go-version: '1.21'
      - run: go mod download
      - run: go test -v ./...
      - run: golangci-lint run ./...
      - run: gosec ./...
"""
)

# ============================================
# Stack Registry
# ============================================

AVAILABLE_STACKS = {
    "python-fastapi": PYTHON_FASTAPI,
    "nodejs-nestjs": NODEJS_NESTJS,
    "go-echo": GO_ECHO,
}

def get_stack(stack_name: str) -> Optional[StackConfig]:
    """Get stack configuration by name"""
    normalized = stack_name.lower().replace(" ", "-")
    return AVAILABLE_STACKS.get(normalized)

def list_stacks() -> Dict[str, str]:
    """List all available stacks"""
    return {
        key: config.name
        for key, config in AVAILABLE_STACKS.items()
    }