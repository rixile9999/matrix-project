def line(name: String, qty: Int, cents: Int): Line = Line(name, qty, Money(cents))

def describe(l: Line): String = l match
  case Line(n, 0, _)                     => s"$n: 품절"
  case Line(n, q, Money(c)) if c >= 1000 => s"$n x$q (고가)"
  case Line(n, q, Money(c))              => s"$n x$q @$c"

@main def tests(): Unit =
  // 1단계: 값 타입
  Judge.check("1단계 값 타입 › 값이 같으면 ==")(
    (Money(5) == Money(5), Money(5) == Money(6), Money(5).equals("5"), Money(5).equals(null)),
    (true, false, false, false))
  Judge.check("1단계 값 타입 › hashCode가 같아야 Set과 Map이 통한다")(
    (Set(Money(5), Money(5), Money(7)).size, Map(Money(1) -> "a").get(Money(1)), List(Money(2), Money(3), Money(2)).distinct.size),
    (2, Some("a"), 2))
  Judge.check("1단계 값 타입 › toString")(
    (Money(150).toString, s"${Money(0)}", List(Money(1), Money(2)).toString),
    ("Money(150)", "Money(0)", "List(Money(1), Money(2))"))

  // 2단계: 연산자
  Judge.check("2단계 연산자 › 중위 연산자 + 와 *")(
    ((Money(100) + Money(50)).cents, (Money(30) * 4).cents, (Money(1) + Money(2) * 3).cents),
    (150, 120, 7))
  Judge.check("2단계 연산자 › 단항 마이너스")(
    ((-Money(30)).cents, (-(Money(5) + Money(5))).cents, (-Money(0)).cents),
    (-30, -10, 0))
  Judge.check("2단계 연산자 › += 는 + 로 풀린다")({
    var sum = Money(0)
    sum += Money(150)
    sum += Money(250) * 2
    sum.cents
  }, 650)
  Judge.check("2단계 연산자 › :: 는 오른쪽 피연산자의 메서드")(
    ((line("a", 1, 1) :: line("b", 1, 1) :: line("c", 1, 1) :: Cart.empty).lines.map(_.name), (line("z", 1, 1) :: Cart.empty).lines.size, Cart.empty.lines.size),
    (List("a", "b", "c"), 1, 0))

  // 3단계: 패턴 매칭
  Judge.check("3단계 패턴 › Money 패턴")(
    (Money(5) match { case Money(c) => c }, Money(0) match { case Money(0) => "공짜"; case _ => "유료" }, Money(7) match { case Money(0) => "공짜"; case _ => "유료" }),
    (5, "공짜", "유료"))
  Judge.check("3단계 패턴 › Line 패턴의 필드 순서")({
    val Line(n, q, p) = line("pen", 3, 150)
    (n, q, p.cents)
  }, ("pen", 3, 150))
  Judge.check("3단계 패턴 › 중첩 패턴, 리터럴, 가드")(
    (describe(line("pen", 3, 150)), describe(line("book", 1, 1200)), describe(line("gum", 0, 80))),
    ("pen x3 @150", "book x1 (고가)", "gum: 품절"))

  // 4단계: for 컴프리헨션
  Judge.check("4단계 for › 생성기 하나와 가드")(
    (for x <- Picks(List(1, 2, 3, 4)) if x % 2 == 0 yield x * 10).items,
    List(20, 40))
  Judge.check("4단계 for › 생성기 둘")(
    (for x <- Picks(List(1, 2)); y <- Picks(List("a", "b")) yield (x, y)).items,
    List((1, "a"), (1, "b"), (2, "a"), (2, "b")))
  Judge.check("4단계 for › 두 번째 생성기의 가드와 중간 val")(
    (for x <- Picks(List(1, 2, 3)); y <- Picks(List(1, 2, 3)) if x < y; s = x + y yield (x, y, s)).items,
    List((1, 2, 3), (1, 3, 4), (2, 3, 5)))
  Judge.check("4단계 for › 빈 입력과 foreach")({
    val seen = scala.collection.mutable.ListBuffer.empty[Int]
    for x <- Picks(List(3, 1, 2)) do seen += x
    ((for x <- Picks(List.empty[Int]) yield x + 1).items, seen.toList)
  }, (Nil, List(3, 1, 2)))

  // 5단계: 함수 객체
  Judge.check("5단계 함수 객체 › 인스턴스를 함수처럼 호출")(
    (Discount(10)(Money(1000)).cents, Discount(0)(Money(500)).cents, Discount(100)(Money(500)).cents),
    (900, 500, 0))
  Judge.check("5단계 함수 객체 › 함수 자리에 그대로 넘긴다")({
    val f: Money => Money = Discount(50)
    (List(Money(1000), Money(200)).map(Discount(50)).map(_.cents), f(Money(10)).cents, (Discount(10) andThen Discount(50))(Money(1000)).cents)
  }, (List(500, 100), 5, 450))

  // 6단계: using
  Judge.check("6단계 using › given이 있으면 인자를 채운다")({
    given TaxRate = TaxRate(20)
    (withTax(Money(1000)).cents, withTax(Money(0)).cents, withTax(Money(15)).cents)
  }, (1200, 0, 18))
  Judge.check("6단계 using › 범위마다 다른 given을 쓴다")(
    ({ given TaxRate = TaxRate(10); withTax(Money(1000)).cents }, { given TaxRate = TaxRate(50); withTax(Money(1000)).cents }),
    (1100, 1500))
  Judge.check("6단계 using › total: 합계, 할인, 세금의 순서")({
    given TaxRate = TaxRate(10)
    val cart = line("pen", 3, 150) :: line("book", 1, 1100) :: Cart.empty
    (total(cart, Discount(15)).cents, total(cart, m => m).cents, total(Cart.empty, Discount(15)).cents)
  }, (1448, 1705, 0))
