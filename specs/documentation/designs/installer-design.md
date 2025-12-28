# Swarm Platform Installer Design Document

**Document ID**: DESIGN-INSTALLER-001  
**Status**: 📋 Draft  
**Author**: Swarm Architecture Team  
**Created**: 2024-12-17  
**Version**: 1.0.0

---

## Executive Summary

This document defines the architecture for a portable, enterprise-ready installer for the Swarm Platform. The installer enables deployment to cloud providers (DigitalOcean, AWS, GCP) and on-premises bare metal servers through a unified configuration-driven approach.

### Goals

1. **One-command deployment** - `./install.sh` with interactive wizard or config file
2. **Multi-provider support** - Cloud and on-premises with same tooling
3. **Air-gap capable** - Enterprise deployments without internet access
4. **Idempotent** - Safe to re-run for updates and repairs
5. **License-ready** - Foundation for commercial on-prem licensing

### Non-Goals

1. Kubernetes deployment (architectural mismatch with Firecracker)
2. Windows server support
3. Multi-node clustering (future consideration)

---

## Background

### Why Custom Installer?

Swarm has unique deployment requirements that don't fit standard patterns:

| Component | Standard Tool Fit | Challenge |
|-----------|-------------------|-----------|
| Firecracker microVMs | ❌ Not containers | K8s fundamentally wrong model |
| Bridge networking + TAP | ❌ Host-level config | Requires privileged access |
| Kernel modules + sysctl | ❌ System config | Not application-layer |
| VM snapshots + rootfs | ❌ Binary artifacts | Custom build pipeline |
| SQLite databases | ✅ Simple | No managed DB needed |
| Multi-service apps | ✅ Standard | PM2/systemd sufficient |

### Evaluated Alternatives

| Approach | Verdict | Rationale |
|----------|---------|-----------|
| Terraform only | ⚠️ Partial | Good for infra, poor for app config |
| Kubernetes + Helm | ❌ Reject | Architectural mismatch with microVMs |
| Ansible only | ⚠️ Partial | Good for config, needs infra layer |
| Pulumi | ⚠️ Partial | Modern Terraform, same limitations |
| Replicated | ✅ Consider | Commercial, turnkey, expensive |
| Custom scripts | ⚠️ Partial | Quick but doesn't scale |

### Decision

**Layered architecture** combining best-of-breed tools:
- **Packer** for golden images
- **Terraform** for infrastructure provisioning  
- **Ansible** for configuration management
- **Custom CLI** for orchestration and UX

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SWARM INSTALLER CLI                              │
│                      (swarm-installer / swarmctl)                       │
│              Interactive wizard + config file + orchestration           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
            ┌───────────────────┼───────────────────┐
            ▼                   ▼                   ▼
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│      PACKER       │ │    TERRAFORM      │ │     ANSIBLE       │
│    (Layer 0)      │ │    (Layer 1)      │ │    (Layer 2)      │
│                   │ │                   │ │                   │
│ • Base images     │ │ • Droplets/VMs    │ │ • Firecracker     │
│ • VM rootfs       │ │ • Volumes         │ │ • Networking      │
│ • Kernel builds   │ │ • DNS records     │ │ • Services        │
│ • Firecracker     │ │ • Firewalls       │ │ • SSL/TLS         │
│                   │ │ • VPC/Networks    │ │ • Backups         │
└───────────────────┘ └───────────────────┘ └───────────────────┘
            │                   │                   │
            └───────────────────┼───────────────────┘
                                ▼
                    ┌───────────────────────┐
                    │     CONFIG STORE      │
                    │  (swarm-config.yaml)  │
                    │                       │
                    │ • Provider creds      │
                    │ • Target IPs          │
                    │ • Domain names        │
                    │ • API keys            │
                    │ • Feature flags       │
                    │ • License key         │
                    └───────────────────────┘
```

### Layer Responsibilities

#### Layer 0: Packer (Image Building)

**Purpose**: Create golden images with all system dependencies pre-installed.

**Outputs**:
- Cloud provider snapshots (DigitalOcean, AWS AMI, GCP Image)
- Portable rootfs for on-prem deployment
- VM rootfs image for Firecracker guests

**Contents**:
- Ubuntu 22.04 LTS base
- Firecracker v1.4.1
- Linux kernel 5.10.225 (with entropy fixes)
- Node.js v20 LTS
- Bridge networking utilities
- System tuning (sysctl, limits)

#### Layer 1: Terraform (Infrastructure)

**Purpose**: Provision cloud infrastructure declaratively.

**Resources Managed**:
- Compute instances (Droplets, EC2, GCE)
- Block storage volumes
- DNS records
- Firewall rules
- VPC/networking
- SSH keys

**State Management**:
- Remote state in cloud provider (DO Spaces, S3, GCS)
- State locking for concurrent access
- Encrypted state for sensitive data

#### Layer 2: Ansible (Configuration)

**Purpose**: Configure servers and deploy applications.

**Responsibilities**:
- Firecracker setup and validation
- Bridge networking configuration
- Application deployment (swarm-platform, swarm-tickets, dashboard)
- Nginx reverse proxy
- SSL certificate provisioning (Let's Encrypt)
- Backup scheduling
- Monitoring agents (optional)

---

## Configuration Schema

### swarm-config.yaml

```yaml
# Swarm Platform Configuration
# Version: 1.0

metadata:
  name: "my-swarm-deployment"
  environment: production  # production | staging | development
  version: "1.0.0"

# Infrastructure Provider
provider:
  type: digitalocean  # digitalocean | aws | gcp | onprem
  
  # DigitalOcean specific
  digitalocean:
    token: "${DO_TOKEN}"  # Environment variable reference
    region: sfo3
    droplet_size: s-4vcpu-16gb-amd
    vpc_name: swarm-vpc
    
  # AWS specific (alternative)
  aws:
    access_key: "${AWS_ACCESS_KEY_ID}"
    secret_key: "${AWS_SECRET_ACCESS_KEY}"
    region: us-west-2
    instance_type: t3.xlarge
    
  # On-premises specific (alternative)
  onprem:
    hosts:
      - ip: 192.168.1.100
        ssh_user: root
        ssh_key_path: ~/.ssh/swarm_key
        roles: [primary]  # primary | worker (future)

# Domain & SSL
domain:
  base: swarmstack.net
  subdomains:
    api: api          # api.swarmstack.net
    dashboard: dashboard  # dashboard.swarmstack.net
  
ssl:
  enabled: true
  provider: letsencrypt  # letsencrypt | custom | none
  email: admin@swarmstack.net
  # Custom certificate paths (if provider: custom)
  custom:
    cert_path: /path/to/cert.pem
    key_path: /path/to/key.pem

# Credentials & Secrets
secrets:
  anthropic_api_key: "${ANTHROPIC_API_KEY}"
  github_pat: "${GITHUB_PAT}"  # Optional
  jwt_secret: "${JWT_SECRET}"  # Auto-generated if not provided
  
# Database
database:
  type: sqlite  # sqlite | postgres (future)
  path: /opt/swarm-platform/data/swarm.db
  backup:
    enabled: true
    schedule: "0 3 * * *"  # Daily at 3 AM
    retention:
      daily: 7
      weekly: 4
      monthly: 12

# Features
features:
  vm_orchestration: true
  agent_learning: false  # Beta
  observability: false   # Prometheus/Grafana stack
  multi_tenant: true

# Resource Limits
resources:
  max_vms: 100
  vm_memory_mb: 512
  vm_vcpus: 1
  snapshot_pool_size: 10

# Networking
networking:
  bridge_name: br0
  bridge_cidr: 10.0.0.0/16
  enable_nat: true
  dns_servers:
    - 8.8.8.8
    - 8.8.4.4

# License (Enterprise)
license:
  key: "${SWARM_LICENSE_KEY}"  # Optional for community edition
  tier: community  # community | professional | enterprise
```

### Environment Variable Support

Configuration supports environment variable substitution:

```yaml
secrets:
  anthropic_api_key: "${ANTHROPIC_API_KEY}"  # Required
  github_pat: "${GITHUB_PAT:-}"              # Optional with empty default
  jwt_secret: "${JWT_SECRET:-auto}"          # Auto-generate if "auto"
```

---

## Installer CLI Design

### Command Interface

```bash
# Interactive installation
swarm-installer install

# Config file installation
swarm-installer install --config swarm-config.yaml

# Validate configuration
swarm-installer validate --config swarm-config.yaml

# Check deployment status
swarm-installer status

# Upgrade existing installation
swarm-installer upgrade --version 1.1.0

# Rollback to previous version
swarm-installer rollback

# Uninstall (with confirmation)
swarm-installer uninstall --confirm

# Generate sample config
swarm-installer init > swarm-config.yaml

# Export current config (sanitized)
swarm-installer export-config > current-config.yaml
```

### Interactive Wizard Flow

```
┌─────────────────────────────────────────────────────────────┐
│                 SWARM PLATFORM INSTALLER                    │
│               Distributed AI Agent System                   │
└─────────────────────────────────────────────────────────────┘

? Select environment: (Use arrow keys)
❯ production
  staging
  development

? Select infrastructure provider:
❯ DigitalOcean
  AWS
  Google Cloud
  On-Premises / Bare Metal

? Enter your domain (e.g., swarm.example.com): swarmstack.net

? Enter Anthropic API key: ****************************

? Enable automated backups? (Y/n): Y

? Enable monitoring stack (Prometheus/Grafana)? (y/N): N

┌─────────────────────────────────────────────────────────────┐
│                    CONFIGURATION SUMMARY                    │
├─────────────────────────────────────────────────────────────┤
│  Environment:     production                                │
│  Provider:        DigitalOcean (sfo3)                      │
│  Domain:          swarmstack.net                           │
│  SSL:             Let's Encrypt                            │
│  Backups:         Enabled (daily)                          │
│  Monitoring:      Disabled                                 │
└─────────────────────────────────────────────────────────────┘

? Proceed with installation? (Y/n): Y

⠋ Provisioning infrastructure with Terraform...
✔ Infrastructure provisioned (2m 34s)

⠋ Configuring server with Ansible...
  → Installing Firecracker
  → Configuring networking
  → Deploying swarm-platform
  → Deploying swarm-dashboard
  → Configuring Nginx
  → Obtaining SSL certificate
✔ Server configured (4m 12s)

⠋ Running post-deployment checks...
✔ All services healthy

┌─────────────────────────────────────────────────────────────┐
│              ✅ DEPLOYMENT COMPLETE                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Dashboard:  https://dashboard.swarmstack.net               │
│  API:        https://api.swarmstack.net                     │
│                                                             │
│  Admin Credentials:                                         │
│    Email:    admin@swarmstack.net                          │
│    Password: <check email or run password reset>           │
│                                                             │
│  Documentation: https://docs.swarmstack.net                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### Terraform Modules

#### Module: swarm-cluster

```hcl
# terraform/modules/swarm-cluster/variables.tf

variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development."
  }
}

variable "provider_config" {
  type = object({
    type   = string
    region = string
    size   = string
  })
}

variable "domain_config" {
  type = object({
    base       = string
    subdomains = map(string)
  })
}

variable "features" {
  type = object({
    backups     = bool
    monitoring  = bool
    multi_tenant = bool
  })
  default = {
    backups     = true
    monitoring  = false
    multi_tenant = true
  }
}
```

```hcl
# terraform/modules/swarm-cluster/main.tf

resource "digitalocean_droplet" "swarm" {
  name     = "swarm-${var.environment}"
  region   = var.provider_config.region
  size     = var.provider_config.size
  image    = data.digitalocean_image.swarm_base.id
  vpc_uuid = digitalocean_vpc.swarm.id
  
  ssh_keys = var.ssh_key_ids
  
  tags = ["swarm", var.environment]
  
  connection {
    type        = "ssh"
    user        = "root"
    private_key = file(var.ssh_private_key_path)
    host        = self.ipv4_address
  }
  
  provisioner "remote-exec" {
    inline = ["echo 'SSH connection established'"]
  }
}

resource "digitalocean_volume" "data" {
  name                    = "swarm-${var.environment}-data"
  region                  = var.provider_config.region
  size                    = 100
  initial_filesystem_type = "ext4"
  
  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_volume_attachment" "data" {
  droplet_id = digitalocean_droplet.swarm.id
  volume_id  = digitalocean_volume.data.id
}

resource "digitalocean_volume" "backup" {
  count  = var.features.backups ? 1 : 0
  name   = "swarm-${var.environment}-backup"
  region = var.provider_config.region
  size   = 100
}

resource "digitalocean_firewall" "swarm" {
  name        = "swarm-${var.environment}-fw"
  droplet_ids = [digitalocean_droplet.swarm.id]
  
  # SSH
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = var.ssh_allowed_ips
  }
  
  # HTTP/HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  
  # All outbound
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

# DNS Records
resource "digitalocean_record" "api" {
  domain = var.domain_config.base
  type   = "A"
  name   = var.domain_config.subdomains.api
  value  = digitalocean_droplet.swarm.ipv4_address
  ttl    = 300
}

resource "digitalocean_record" "dashboard" {
  domain = var.domain_config.base
  type   = "A"
  name   = var.domain_config.subdomains.dashboard
  value  = digitalocean_droplet.swarm.ipv4_address
  ttl    = 300
}
```

### Ansible Roles

#### Role: firecracker

```yaml
# ansible/roles/firecracker/tasks/main.yml
---
- name: Check if Firecracker is installed
  stat:
    path: /usr/local/bin/firecracker
  register: firecracker_binary

- name: Download Firecracker
  get_url:
    url: "https://github.com/firecracker-microvm/firecracker/releases/download/v{{ firecracker_version }}/firecracker-v{{ firecracker_version }}-x86_64.tgz"
    dest: /tmp/firecracker.tgz
  when: not firecracker_binary.stat.exists

- name: Extract Firecracker
  unarchive:
    src: /tmp/firecracker.tgz
    dest: /tmp
    remote_src: yes
  when: not firecracker_binary.stat.exists

- name: Install Firecracker binary
  copy:
    src: "/tmp/release-v{{ firecracker_version }}-x86_64/firecracker-v{{ firecracker_version }}-x86_64"
    dest: /usr/local/bin/firecracker
    mode: '0755'
    remote_src: yes
  when: not firecracker_binary.stat.exists

- name: Install jailer binary
  copy:
    src: "/tmp/release-v{{ firecracker_version }}-x86_64/jailer-v{{ firecracker_version }}-x86_64"
    dest: /usr/local/bin/jailer
    mode: '0755'
    remote_src: yes
  when: not firecracker_binary.stat.exists

- name: Create Firecracker directories
  file:
    path: "{{ item }}"
    state: directory
    mode: '0755'
  loop:
    - /opt/swarm/kernel
    - /opt/swarm/images
    - /opt/swarm/snapshots
    - /opt/swarm/sockets

- name: Copy kernel image
  copy:
    src: "{{ kernel_image_path }}"
    dest: /opt/swarm/kernel/vmlinux
    mode: '0644'

- name: Copy rootfs image
  copy:
    src: "{{ rootfs_image_path }}"
    dest: /opt/swarm/images/rootfs.ext4
    mode: '0644'

- name: Configure kernel parameters
  sysctl:
    name: "{{ item.name }}"
    value: "{{ item.value }}"
    state: present
    sysctl_set: yes
    reload: yes
  loop:
    - { name: 'net.ipv4.ip_forward', value: '1' }
    - { name: 'net.ipv4.conf.all.forwarding', value: '1' }
    - { name: 'net.bridge.bridge-nf-call-iptables', value: '0' }
    - { name: 'net.bridge.bridge-nf-call-ip6tables', value: '0' }

- name: Load br_netfilter module
  modprobe:
    name: br_netfilter
    state: present

- name: Ensure br_netfilter loads on boot
  lineinfile:
    path: /etc/modules-load.d/br_netfilter.conf
    line: br_netfilter
    create: yes
```

#### Role: swarm-platform

```yaml
# ansible/roles/swarm-platform/tasks/main.yml
---
- name: Create swarm user
  user:
    name: swarm
    system: yes
    shell: /bin/bash
    home: /opt/swarm-platform

- name: Clone swarm-platform repository
  git:
    repo: "{{ swarm_platform_repo }}"
    dest: /opt/swarm-platform
    version: "{{ swarm_version }}"
    accept_hostkey: yes
  become_user: swarm

- name: Install Node.js dependencies
  npm:
    path: /opt/swarm-platform
    state: present
  environment:
    NODE_ENV: production

- name: Create data directory
  file:
    path: /opt/swarm-platform/data
    state: directory
    owner: swarm
    group: swarm
    mode: '0755'

- name: Configure environment file
  template:
    src: env.j2
    dest: /opt/swarm-platform/.env
    owner: swarm
    group: swarm
    mode: '0600'
  notify: Restart swarm-platform

- name: Initialize database
  command: node scripts/init-db.js
  args:
    chdir: /opt/swarm-platform
    creates: /opt/swarm-platform/data/swarm.db
  become_user: swarm

- name: Create PM2 ecosystem config
  template:
    src: ecosystem.config.js.j2
    dest: /opt/swarm-platform/ecosystem.config.js
    owner: swarm
    group: swarm
    mode: '0644'

- name: Start swarm-platform with PM2
  command: pm2 start ecosystem.config.js --env production
  args:
    chdir: /opt/swarm-platform
  become_user: swarm
  register: pm2_start
  changed_when: "'started' in pm2_start.stdout"

- name: Save PM2 process list
  command: pm2 save
  become_user: swarm

- name: Configure PM2 startup
  command: pm2 startup systemd -u swarm --hp /opt/swarm-platform
  register: pm2_startup
  changed_when: pm2_startup.rc == 0
```

#### Role: nginx

```yaml
# ansible/roles/nginx/tasks/main.yml
---
- name: Install Nginx
  apt:
    name: nginx
    state: present
    update_cache: yes

- name: Remove default site
  file:
    path: /etc/nginx/sites-enabled/default
    state: absent
  notify: Reload nginx

- name: Create Nginx configuration for Swarm
  template:
    src: swarm.conf.j2
    dest: /etc/nginx/sites-available/swarm.conf
    mode: '0644'
  notify: Reload nginx

- name: Enable Swarm site
  file:
    src: /etc/nginx/sites-available/swarm.conf
    dest: /etc/nginx/sites-enabled/swarm.conf
    state: link
  notify: Reload nginx

- name: Test Nginx configuration
  command: nginx -t
  changed_when: false

- name: Ensure Nginx is running
  service:
    name: nginx
    state: started
    enabled: yes
```

```nginx
# ansible/roles/nginx/templates/swarm.conf.j2
# Swarm Platform Nginx Configuration

upstream swarm_api {
    server 127.0.0.1:3000;
    keepalive 32;
}

upstream swarm_dashboard {
    server 127.0.0.1:3001;
    keepalive 32;
}

upstream swarm_tickets {
    server 127.0.0.1:8080;
    keepalive 32;
}

# API Server
server {
    listen 80;
    server_name {{ domain_api }};
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name {{ domain_api }};
    
    ssl_certificate /etc/letsencrypt/live/{{ domain_base }}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{ domain_base }}/privkey.pem;
    
    location / {
        proxy_pass http://swarm_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Dashboard
server {
    listen 80;
    server_name {{ domain_dashboard }};
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name {{ domain_dashboard }};
    
    ssl_certificate /etc/letsencrypt/live/{{ domain_base }}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/{{ domain_base }}/privkey.pem;
    
    root /opt/swarm-dashboard/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://swarm_tickets;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /ws {
        proxy_pass http://swarm_tickets;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Package Structure

### Installer Distribution

```
swarm-installer-v1.0.0/
├── install.sh                      # Entry point script
├── README.md                       # Quick start guide
├── LICENSE                         # License file
│
├── bin/
│   ├── swarm-installer             # Main CLI binary (Go/Rust compiled)
│   ├── terraform                   # Bundled Terraform binary
│   ├── ansible-playbook            # Bundled Ansible
│   └── packer                      # Bundled Packer
│
├── terraform/
│   ├── main.tf                     # Root module
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── modules/
│       ├── digitalocean/
│       ├── aws/
│       ├── gcp/
│       └── onprem/
│
├── ansible/
│   ├── ansible.cfg
│   ├── playbooks/
│   │   ├── deploy-swarm.yml
│   │   ├── upgrade-swarm.yml
│   │   └── rollback-swarm.yml
│   ├── roles/
│   │   ├── common/
│   │   ├── firecracker/
│   │   ├── networking/
│   │   ├── swarm-platform/
│   │   ├── swarm-tickets/
│   │   ├── swarm-dashboard/
│   │   ├── nginx/
│   │   ├── ssl/
│   │   ├── backup/
│   │   └── monitoring/
│   └── inventory/
│       └── templates/
│
├── packer/
│   ├── swarm-base.pkr.hcl
│   └── scripts/
│       ├── install-firecracker.sh
│       ├── install-node.sh
│       └── configure-kernel.sh
│
├── artifacts/                      # Pre-built binaries (air-gap)
│   ├── vmlinux-5.10.225           # Linux kernel
│   ├── rootfs.ext4.gz             # Compressed rootfs
│   ├── firecracker-v1.4.1         # Firecracker binary
│   └── node-modules.tar.gz        # npm packages (offline)
│
├── config/
│   ├── swarm-config.example.yaml  # Example configuration
│   └── swarm-config.schema.json   # JSON Schema for validation
│
└── docs/
    ├── installation.md
    ├── configuration.md
    ├── troubleshooting.md
    └── upgrading.md
```

### Air-Gap Package

For environments without internet access:

```
swarm-installer-airgap-v1.0.0/
├── <everything from standard package>
│
├── artifacts/
│   ├── vmlinux-5.10.225
│   ├── rootfs.ext4.gz
│   ├── firecracker-v1.4.1
│   ├── node-v20.10.0-linux-x64.tar.gz
│   ├── node-modules-swarm-platform.tar.gz
│   ├── node-modules-swarm-tickets.tar.gz
│   ├── node-modules-swarm-dashboard.tar.gz
│   └── deb-packages/              # Required .deb packages
│       ├── nginx_1.24.0-1_amd64.deb
│       ├── sqlite3_3.40.1-1_amd64.deb
│       └── ...
│
└── checksums.sha256               # Integrity verification
```

---

## Implementation Phases

### Phase 1: MVP Installer (2-3 weeks)

**Goal**: Working installer for DigitalOcean + on-prem SSH

**Deliverables**:
1. Ansible playbooks for full deployment
2. YAML configuration schema
3. Shell script wrapper with basic prompts
4. Documentation

**Scope**:
- Single provider: DigitalOcean
- Single server deployment
- Manual DNS configuration
- Let's Encrypt SSL

### Phase 2: Full IaC (4-6 weeks)

**Goal**: Complete infrastructure-as-code with multi-provider support

**Deliverables**:
1. Terraform modules for DO, AWS, GCP
2. Packer templates for golden images
3. Interactive CLI with inquirer-style prompts
4. State management
5. Upgrade/rollback capability

**Scope**:
- All major cloud providers
- Automated DNS management
- Custom SSL certificate support
- Configuration validation

### Phase 3: Enterprise Package (6-8 weeks)

**Goal**: Production-ready enterprise installer

**Deliverables**:
1. Self-contained binary installer
2. Air-gap support with bundled dependencies
3. License key validation system
4. Support bundle generation
5. Comprehensive documentation

**Scope**:
- Offline installation
- License tiers (community/professional/enterprise)
- Audit logging
- Health check endpoints
- Automated support diagnostics

---

## Security Considerations

### Credential Handling

1. **Never store credentials in plain text**
   - Use environment variables
   - Support secret managers (Vault, AWS Secrets Manager)
   
2. **Minimal credential scope**
   - Cloud API tokens: only required permissions
   - SSH keys: dedicated installer key, rotate after install

3. **Audit trail**
   - Log all configuration changes
   - Track who deployed and when

### Network Security

1. **Default firewall rules**
   - SSH: Restrict to known IPs
   - HTTP/HTTPS: Public
   - Internal services: Localhost only

2. **SSL/TLS by default**
   - Auto-provision Let's Encrypt
   - Minimum TLS 1.2

### Supply Chain

1. **Signed releases**
   - GPG signatures on installer packages
   - Checksum verification

2. **Dependency pinning**
   - Lock all dependency versions
   - Verify checksums for air-gap packages

---

## Testing Strategy

### Unit Tests

- Configuration parsing and validation
- Template rendering
- Provider-specific logic

### Integration Tests

- Terraform plan/apply on test infrastructure
- Ansible playbook syntax and idempotence
- End-to-end deployment to test droplet

### Acceptance Tests

- Fresh install on each supported provider
- Upgrade from previous version
- Rollback to previous version
- Air-gap installation

### Test Matrix

| Provider | Fresh Install | Upgrade | Rollback | Air-Gap |
|----------|---------------|---------|----------|---------|
| DigitalOcean | ✓ | ✓ | ✓ | ✓ |
| AWS | ✓ | ✓ | ✓ | ✓ |
| GCP | ✓ | ✓ | ✓ | ✓ |
| On-Prem Ubuntu | ✓ | ✓ | ✓ | ✓ |
| On-Prem Debian | ✓ | ✓ | ✓ | ✓ |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to deploy (fresh) | < 15 minutes |
| Time to upgrade | < 5 minutes |
| Installation success rate | > 99% |
| Configuration errors caught | 100% (pre-flight) |
| Documentation coverage | 100% of features |

---

## Open Questions

1. **Multi-node clustering**: Should Phase 2 include horizontal scaling?
2. **Backup restore UI**: Should installer include restore functionality?
3. **Monitoring default**: Should Prometheus/Grafana be opt-out instead of opt-in?
4. **Commercial licensing**: Build in-house or use Replicated/KeyGen?

---

## References

- [Terraform Best Practices](https://www.terraform.io/docs/cloud/guides/recommended-practices/)
- [Ansible Best Practices](https://docs.ansible.com/ansible/latest/user_guide/playbooks_best_practices.html)
- [Packer Documentation](https://www.packer.io/docs)
- [Firecracker Getting Started](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md)
- [Replicated KOTS](https://docs.replicated.com/intro-kots) (commercial alternative)

---

## Appendix A: Sample Installation Commands

```bash
# Download installer
curl -sL https://get.swarmstack.net/installer | tar xz
cd swarm-installer-v1.0.0

# Interactive installation
./install.sh

# Config file installation
./install.sh --config my-config.yaml

# Generate sample config
./bin/swarm-installer init > my-config.yaml

# Validate config without deploying
./bin/swarm-installer validate --config my-config.yaml

# Check existing deployment status
./bin/swarm-installer status

# Upgrade to new version
./bin/swarm-installer upgrade --version 1.1.0

# Generate support bundle
./bin/swarm-installer support-bundle > swarm-support.tar.gz
```

---

## Appendix B: Error Handling

### Pre-flight Checks

```yaml
preflight_checks:
  - name: SSH connectivity
    command: ssh -o ConnectTimeout=10 {{ target_host }} echo ok
    
  - name: Minimum RAM
    command: free -g | awk '/^Mem:/{print ($2 >= 8)}'
    
  - name: Minimum disk space
    command: df -BG / | awk 'NR==2 {gsub("G",""); print ($4 >= 50)}'
    
  - name: Required ports available
    command: netstat -tuln | grep -E ':80|:443|:3000' | wc -l
    expected: 0
    
  - name: DNS resolution
    command: dig +short {{ domain_api }} | head -1
```

### Rollback Triggers

Automatic rollback if:
- Service health checks fail after 5 minutes
- Database migration fails
- SSL certificate provisioning fails
- Any Ansible task fails in critical roles

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2024-12-17 | Swarm Team | Initial specification |
