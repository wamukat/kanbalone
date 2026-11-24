# 計測用の合成Markdown

この入力を6種類の表示領域で使用しました。チケット番号と添付先は隔離サンプルのものです。

````markdown
# Markdownの見出し1
## 見出し2
### 見出し3
#### 見出し4
##### 見出し5
###### 見出し6

通常の段落に **強調**、*斜体*、~~取り消し~~、`inline()` を置きます。
最初の行。  
改行した2行目です。

[外部リンク](https://example.invalid/markdown) と関連する合成チケット #4。

> チェックリストを読み合わせます。

- 箇条書き
- [ ] 未完了の項目
- [x] 完了した項目

1. 先に確認
2. 後で共有

| 項目 | 状態 |
| --- | --- |
| 本文 | 確認済み |
| 添付 | 未確認 |

```javascript
// Catalog fixture
function summarize(value) {
  const state = "ready";
  return state + value + 2;
}
```

---

![合成サンプル画像](/api/attachments/ff164e1f5b53e4f8d289ffe2b2736cad4c5d04f7b85d75ae862e4c503f49d708)
````
