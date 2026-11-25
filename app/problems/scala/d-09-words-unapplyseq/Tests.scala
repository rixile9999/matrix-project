def describe(s: String): String = s match
  case Quoted()              => "quoted"
  case Words()               => "blank"
  case Words(w)              => s"one:$w"
  case Words("go", dir)      => s"move:$dir"
  case Words(first, rest*)   => s"$first+${rest.length}"

@main def tests(): Unit =
  Judge.check("한 단어")(describe("hello"), "one:hello")
  Judge.check("여러 단어")(describe("a b c d"), "a+3")
  Judge.check("중첩 리터럴")(describe("go north"), "move:north")
  Judge.check("go 뒤가 둘")(describe("go up now"), "go+2")
  Judge.check("빈 문자열")(describe(""), "blank")
  Judge.check("공백만, 여분 공백")(describe("   "), "blank")
  Judge.check("여분 공백")(describe("  a   b "), "a+1")
  Judge.check("따옴표")(describe("\"hi there\""), "quoted")
  Judge.check("따옴표 하나")(describe("\"x"), "one:\"x")
