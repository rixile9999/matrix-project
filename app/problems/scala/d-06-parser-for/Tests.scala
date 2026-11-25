def digit: Parser[Int] = for c <- item if c.isDigit yield c - '0'
def twoChars: Parser[String] = for a <- item; b <- item yield s"$a$b"
def number: Parser[Int] = for a <- digit; b <- digit yield a * 10 + b
def pair: Parser[(Int, Int)] =
  for
    a <- number
    c <- item
    if c == ','
    b <- number
  yield (a, b)

@main def tests(): Unit =
  // 1단계: map
  Judge.check("1단계 map › 값을 바꾸고 남은 입력은 그대로")(item.map(_.toUpper).run("abc"), Some(('A', "bc")))
  Judge.check("1단계 map › 실패는 실패 그대로")(item.map(_.toUpper).run(""), None)
  Judge.check("1단계 map › pure에 map")(pure(20).map(_ + 1).run("xy"), Some((21, "xy")))

  // 2단계: flatMap
  Judge.check("2단계 flatMap › 남은 입력이 다음 파서로 이어진다")(
    item.flatMap(a => item.map(b => s"$a$b")).run("abcd"), Some(("ab", "cd")))
  Judge.check("2단계 flatMap › 둘째가 실패하면 전체 실패")(
    item.flatMap(a => item.map(b => s"$a$b")).run("a"), None)
  Judge.check("2단계 flatMap › 첫째가 실패하면 전체 실패")(
    item.flatMap(a => pure(a)).run(""), None)

  // 3단계: for로 조합 (map + flatMap)
  Judge.check("3단계 for › 두 글자")(twoChars.run("xyz"), Some(("xy", "z")))
  Judge.check("3단계 for › 입력이 모자라면 None")(twoChars.run("x"), None)

  // 4단계: 가드 (withFilter)
  Judge.check("4단계 가드 › 숫자 한 글자")(digit.run("7a"), Some((7, "a")))
  Judge.check("4단계 가드 › 숫자가 아니면 None")(digit.run("a7"), None)
  Judge.check("4단계 가드 › 두 자리 수")(number.run("42x"), Some((42, "x")))
  Judge.check("4단계 가드 › 쉼표로 이은 두 수")(pair.run("12,34!"), Some(((12, 34), "!")))
  Judge.check("4단계 가드 › 쉼표가 아니면 None")(pair.run("12;34"), None)
