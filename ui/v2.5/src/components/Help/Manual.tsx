import React, { useState, useEffect } from "react";
import { Modal, Container, Row, Col, Nav, Tab } from "react-bootstrap";
import Introduction from "src/docs/zh-CN/Manual/Introduction.md";
import Tasks from "src/docs/zh-CN/Manual/Tasks.md";
import AutoTagging from "src/docs/zh-CN/Manual/AutoTagging.md";
import JSONSpec from "src/docs/zh-CN/Manual/JSONSpec.md";
import Configuration from "src/docs/zh-CN/Manual/Configuration.md";
import Interface from "src/docs/zh-CN/Manual/Interface.md";
import Images from "src/docs/zh-CN/Manual/Images.md";
import Scraping from "src/docs/zh-CN/Manual/Scraping.md";
import ScraperDevelopment from "src/docs/zh-CN/Manual/ScraperDevelopment.md";
import Plugins from "src/docs/zh-CN/Manual/Plugins.md";
import ExternalPlugins from "src/docs/zh-CN/Manual/ExternalPlugins.md";
import EmbeddedPlugins from "src/docs/zh-CN/Manual/EmbeddedPlugins.md";
import UIPluginApi from "src/docs/zh-CN/Manual/UIPluginApi.md";
import Tagger from "src/docs/zh-CN/Manual/Tagger.md";
import Contributing from "src/docs/zh-CN/Manual/Contributing.md";
import SceneFilenameParser from "src/docs/zh-CN/Manual/SceneFilenameParser.md";
import KeyboardShortcuts from "src/docs/zh-CN/Manual/KeyboardShortcuts.md";
import Help from "src/docs/zh-CN/Manual/Help.md";
import Deduplication from "src/docs/zh-CN/Manual/Deduplication.md";
import Interactive from "src/docs/zh-CN/Manual/Interactive.md";
import Captions from "src/docs/zh-CN/Manual/Captions.md";
import Identify from "src/docs/zh-CN/Manual/Identify.md";
import Browsing from "src/docs/zh-CN/Manual/Browsing.md";
import TroubleshootingMode from "src/docs/zh-CN/Manual/TroubleshootingMode.md";
import { MarkdownPage } from "../Shared/MarkdownPage";

interface IManualProps {
  animation?: boolean;
  show: boolean;
  onClose: () => void;
  defaultActiveTab?: string;
}

export const Manual: React.FC<IManualProps> = ({
  animation,
  show,
  onClose,
  defaultActiveTab,
}) => {
  const content = [
    {
      key: "Introduction.md",
      title: "入门介绍",
      content: Introduction,
    },
    {
      key: "Configuration.md",
      title: "系统配置",
      content: Configuration,
    },
    {
      key: "Interface.md",
      title: "界面选项",
      content: Interface,
    },
    {
      key: "Tasks.md",
      title: "任务管理",
      content: Tasks,
    },
    {
      key: "Identify.md",
      title: "元数据识别",
      content: Identify,
      className: "indent-1",
    },
    {
      key: "AutoTagging.md",
      title: "自动打标签",
      content: AutoTagging,
      className: "indent-1",
    },
    {
      key: "SceneFilenameParser.md",
      title: "短片文件名解析器",
      content: SceneFilenameParser,
      className: "indent-1",
    },
    {
      key: "JSONSpec.md",
      title: "JSON 规范说明",
      content: JSONSpec,
      className: "indent-1",
    },
    {
      key: "Browsing.md",
      title: "浏览与筛选",
      content: Browsing,
    },
    {
      key: "Images.md",
      title: "图片与图库",
      content: Images,
    },
    {
      key: "Scraping.md",
      title: "元数据刮削",
      content: Scraping,
    },
    {
      key: "ScraperDevelopment.md",
      title: "刮削器开发",
      content: ScraperDevelopment,
      className: "indent-1",
    },
    {
      key: "Plugins.md",
      title: "插件系统",
      content: Plugins,
    },
    {
      key: "ExternalPlugins.md",
      title: "外部插件",
      content: ExternalPlugins,
      className: "indent-1",
    },
    {
      key: "EmbeddedPlugins.md",
      title: "内置插件",
      content: EmbeddedPlugins,
      className: "indent-1",
    },
    {
      key: "UIPluginApi.md",
      title: "UI 插件接口 API",
      content: UIPluginApi,
      className: "indent-1",
    },
    {
      key: "Tagger.md",
      title: "短片打标器",
      content: Tagger,
    },
    {
      key: "Deduplication.md",
      title: "重复项查重",
      content: Deduplication,
    },
    {
      key: "Interactive.md",
      title: "交互设备",
      content: Interactive,
    },
    {
      key: "Captions.md",
      title: "字幕支持",
      content: Captions,
    },
    {
      key: "KeyboardShortcuts.md",
      title: "快捷键列表",
      content: KeyboardShortcuts,
    },
    {
      key: "TroubleshootingMode.md",
      title: "故障排除模式",
      content: TroubleshootingMode,
    },
    {
      key: "Contributing.md",
      title: "参与贡献",
      content: Contributing,
    },
    {
      key: "Help.md",
      title: "获取更多帮助",
      content: Help,
    },
  ];

  const [activeTab, setActiveTab] = useState<string>();

  useEffect(() => {
    setActiveTab(defaultActiveTab);
  }, [defaultActiveTab]);

  // links to other manual pages are specified as "/help/page.md"
  // intercept clicks to these pages and set the tab accordingly
  function interceptLinkClick(
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) {
    if (event.target instanceof HTMLAnchorElement) {
      const href = event.target.getAttribute("href");
      if (href?.startsWith("/help")) {
        const newKey = event.target.pathname.substring("/help/".length);
        setActiveTab(newKey);
        event.preventDefault();
      }
    }
  }

  return (
    <Modal
      animation={animation}
      show={show}
      onHide={onClose}
      dialogClassName="modal-dialog-scrollable manual modal-xl"
    >
      <Modal.Header closeButton>
        <Modal.Title>帮助与使用手册</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Container className="manual-container">
          <Tab.Container
            activeKey={activeTab ?? content[0].key}
            onSelect={(k) => k && setActiveTab(k)}
            id="manual-tabs"
          >
            <Row>
              <Col lg={3} className="mb-3 mb-lg-0 manual-toc">
                <Nav variant="pills" className="flex-column">
                  {content.map((c) => {
                    return (
                      <Nav.Item key={`${c.key}-nav`}>
                        <Nav.Link className={c.className} eventKey={c.key}>
                          {c.title}
                        </Nav.Link>
                      </Nav.Item>
                    );
                  })}
                  <hr className="d-sm-none" />
                </Nav>
              </Col>
              <Col lg={9} className="manual-content">
                <Tab.Content>
                  {content.map((c) => {
                    return (
                      <Tab.Pane
                        eventKey={c.key}
                        key={`${c.key}-pane`}
                        onClick={interceptLinkClick}
                      >
                        <MarkdownPage page={c.content} />
                      </Tab.Pane>
                    );
                  })}
                </Tab.Content>
              </Col>
            </Row>
          </Tab.Container>
        </Container>
      </Modal.Body>
    </Modal>
  );
};

export default Manual;
