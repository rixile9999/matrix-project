@main def tests(): Unit =
  def enc[A](a: A)(using e: Encoder[A]): String = e.encode(a)

  // 1단계: Int · Boolean · String 인스턴스
  Judge.check("1단계 기본 인스턴스 › Int")((enc(42), enc(-7), enc(0)), ("42", "-7", "0"))
  Judge.check("1단계 기본 인스턴스 › Boolean")((enc(true), enc(false)), ("true", "false"))
  Judge.check("1단계 기본 인스턴스 › String은 큰따옴표로 감싼다")((enc("hi"), enc("")), ("\"hi\"", "\"\""))
  Judge.check("1단계 기본 인스턴스 › 큰따옴표·역슬래시·줄바꿈은 이스케이프")(
    (enc("say \"hi\""), enc("a\\b"), enc("x\ny"), enc("\\\"")),
    ("\"say \\\"hi\\\"\"", "\"a\\\\b\"", "\"x\\ny\"", "\"\\\\\\\"\""))

  // 2단계: List · Option 인스턴스
  Judge.check("2단계 파생 인스턴스 › List는 대괄호와 쉼표(공백 없음)")(
    (enc(List(1, 2, 3)), enc(List.empty[Int]), enc(List("a", "b"))),
    ("[1,2,3]", "[]", "[\"a\",\"b\"]"))
  Judge.check("2단계 파생 인스턴스 › Option은 값 또는 null")(
    (enc(Option(5)), enc(Option.empty[Int]), enc(Option("x"))),
    ("5", "null", "\"x\""))
  Judge.check("2단계 파생 인스턴스 › 겹쳐 쓰기")(
    (enc(List(List(1), Nil, List(2, 3))), enc(List(Option(true), None)), enc(Option(List("q")))),
    ("[[1],[],[2,3]]", "[true,null]", "[\"q\"]"))
  Judge.check("2단계 파생 인스턴스 › 본보기 Double과도 함께 쓰인다")(
    (enc(List(Option(1.5), None)), enc(Option(List(2.0)))),
    ("[1.5,null]", "[2.0]"))

  // 3단계: toJson
  Judge.check("3단계 toJson › 기본 타입")((5.toJson, true.toJson, "a\"b".toJson), ("5", "true", "\"a\\\"b\""))
  Judge.check("3단계 toJson › 파생 타입")(
    (List(1, 2).toJson, Option("x").toJson, List(Option(1), None).toJson),
    ("[1,2]", "\"x\"", "[1,null]"))
  Judge.check("3단계 toJson › 안에 든 값의 타입으로 인스턴스를 고른다")(
    List(List("a"), List("b", "c")).toJson,
    "[[\"a\"],[\"b\",\"c\"]]")

  // 4단계: jsonObject
  Judge.check("4단계 jsonObject › 키와 값을 모두 인코딩")(
    jsonObject(List("a" -> 1, "b" -> 2)),
    "{\"a\":1,\"b\":2}")
  Judge.check("4단계 jsonObject › 키도 이스케이프")(
    jsonObject(List("k\"ey" -> true)),
    "{\"k\\\"ey\":true}")
  Judge.check("4단계 jsonObject › 값이 파생 타입이어도 동작")(
    jsonObject(List("xs" -> List(1, 2), "ys" -> Nil)),
    "{\"xs\":[1,2],\"ys\":[]}")
  Judge.check("4단계 jsonObject › 필드가 없으면 빈 객체")(jsonObject(List.empty[(String, Int)]), "{}")
